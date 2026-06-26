import os
import asyncio
import base64
import json
import logging
import math
import re
import time
import uuid
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import unquote
from uuid import UUID
from fastapi import Depends, FastAPI, UploadFile, HTTPException, Request, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openai import AsyncOpenAI, OpenAI
from dotenv import load_dotenv
from typing import Any, Dict, List

try:
    from supabase import ClientOptions, create_client
except ImportError:
    create_client = None
    ClientOptions = None

# --- MULTIMODAL PARSER EXTENSIONS ---
import fitz  # PyMuPDF
from pptx import Presentation
import docx  # python-docx
import pandas as pd  # pandas for Excel automation

# 1. ENVIRONMENT CONFIGURATION MAPPING (Look up one level to target root .env.local)
backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent
env_path = root_dir / ".env.local"
load_dotenv(dotenv_path=env_path)

# 2. APPLICATION INITIALIZATION
app = FastAPI(title="MeliusAI Omnivorous Multimodal Agent")

# Authorized browser origins for the production frontend and local development.
origins = [
    "https://www.meliusai.in",
    "https://meliusai.in",
    "http://localhost:3000",
]

# Enable Cross-Origin Resource Sharing (CORS) for authorized frontend surfaces.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def enforce_cors_origin_whitelist(request: Request, call_next):
    origin = request.headers.get("origin")

    if origin and origin not in origins:
        return JSONResponse(
            status_code=403,
            content={
                "detail": "The CORS security policy for this backend API does not allow access from the specified Origin."
            },
        )

    return await call_next(request)

# Initialize OpenAI Client (Guaranteed to read from root .env.local now)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
async_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
logger = logging.getLogger("meliusai.backend")
supabase_backend_client = None
supabase = None
bearer_scheme = HTTPBearer(auto_error=False)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
AUTHORIZED_REVIEWER_ROLES = {"admin", "reviewer", "recruiter", "corporate", "organization"}

BIO_EXTRACTION_SYSTEM_PROMPT = (
    "You are an expert technical recruiter. Analyze the following candidate biography. "
    "Extract specific technical experiences (years, tools, roles) and work preferences "
    "(remote, hybrid, startup, enterprise, etc.). Return ONLY a valid JSON object with two "
    "keys: 'experience' (a list of strings) and 'preferences' (a list of strings). Do not "
    "return markdown, just raw JSON."
)

SEARCH_QUERY_SYSTEM_PROMPT = (
    "You are a talent search engine. The user will type a natural language search query. "
    "Extract their intent into a JSON object with three arrays: 'target_skills' "
    "(e.g. ['ui', 'ux', 'designer']), 'target_experience' (convert words to numbers, "
    "e.g. ['4 years']), and 'target_preferences', plus 'target_name': str | null. "
    "If the query contains a specific person's name or username, extract it into "
    "'target_name'. Otherwise, leave it null. Return ONLY valid JSON."
)


async def extract_bio_data(bio_text: str) -> Dict[str, List[str]]:
    clean_bio = str(bio_text or "").strip()

    if not clean_bio:
        return {"experience": [], "preferences": []}

    try:
        completion = await async_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": BIO_EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": clean_bio},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw_content = completion.choices[0].message.content or "{}"
        parsed_content = json.loads(raw_content)

        def normalize_extracted_list(value: Any) -> List[str]:
            if not isinstance(value, list):
                return []

            normalized_values = []
            for item in value:
                normalized_item = str(item).strip()
                if normalized_item and normalized_item not in normalized_values:
                    normalized_values.append(normalized_item)

            return normalized_values

        return {
            "experience": normalize_extracted_list(parsed_content.get("experience")),
            "preferences": normalize_extracted_list(parsed_content.get("preferences")),
        }
    except Exception as extraction_error:
        logger.warning("Candidate bio extraction failed: %s", extraction_error)
        return {"experience": [], "preferences": []}


async def parse_search_query(query: str) -> dict:
    clean_query = str(query or "").strip()
    empty_intent = {
        "target_skills": [],
        "target_experience": [],
        "target_preferences": [],
        "target_name": None,
    }

    if not clean_query:
        return empty_intent

    try:
        completion = await async_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SEARCH_QUERY_SYSTEM_PROMPT},
                {"role": "user", "content": clean_query},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw_content = completion.choices[0].message.content or "{}"
        parsed_content = json.loads(raw_content)

        def normalize_intent_values(value: Any) -> List[str]:
            if not isinstance(value, list):
                return []

            normalized_values = []
            for item in value:
                normalized_item = str(item).strip().lower()
                if normalized_item and normalized_item not in normalized_values:
                    normalized_values.append(normalized_item)

            return normalized_values

        return {
            "target_skills": normalize_intent_values(parsed_content.get("target_skills")),
            "target_experience": normalize_intent_values(parsed_content.get("target_experience")),
            "target_preferences": normalize_intent_values(parsed_content.get("target_preferences")),
            "target_name": (
                str(parsed_content.get("target_name")).strip()
                if isinstance(parsed_content.get("target_name"), str)
                and str(parsed_content.get("target_name")).strip()
                else None
            ),
        }
    except Exception as parsing_error:
        logger.warning("Talent search query parsing failed: %s", parsing_error)
        return empty_intent

def get_supabase_public_config():
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=500,
            detail="Supabase URL/anon key environment variables are not configured.",
        )

    return supabase_url, supabase_key


def get_supabase_backend_client():
    global supabase_backend_client

    if create_client is None:
        raise HTTPException(
            status_code=500,
            detail="The supabase-py package is not installed in the Python backend environment.",
        )

    if supabase_backend_client is None:
        supabase_url, supabase_key = get_supabase_public_config()
        supabase_backend_client = create_client(supabase_url, supabase_key)

    return supabase_backend_client


def get_supabase_authenticated_client(access_token: str):
    if create_client is None or ClientOptions is None:
        raise HTTPException(
            status_code=500,
            detail="The supabase-py package is not installed in the Python backend environment.",
        )

    supabase_url, supabase_key = get_supabase_public_config()
    options = ClientOptions(
        headers={"Authorization": f"Bearer {access_token}"},
        auto_refresh_token=False,
        persist_session=False,
    )
    return create_client(supabase_url, supabase_key, options)


def get_request_supabase_client(request: Request):
    authenticated_client = getattr(request.state, "supabase", None)

    if authenticated_client is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return authenticated_client


def get_supabase_user_id(user_response: Any) -> str | None:
    auth_user = getattr(user_response, "user", None)

    if isinstance(auth_user, dict):
        user_id = auth_user.get("id")
    else:
        user_id = getattr(auth_user, "id", None)

    return str(user_id).strip() if user_id else None


def get_supabase_user_roles(user_response: Any) -> List[str]:
    auth_user = getattr(user_response, "user", None)
    role_values = []

    for metadata_name in ("app_metadata", "user_metadata"):
        metadata = (
            auth_user.get(metadata_name)
            if isinstance(auth_user, dict)
            else getattr(auth_user, metadata_name, None)
        )
        if isinstance(metadata, dict):
            role_values.extend([metadata.get("role"), metadata.get("roles")])

    normalized_roles = []
    for value in role_values:
        values = value if isinstance(value, list) else [value]
        for role in values:
            if isinstance(role, str) and role.strip():
                normalized_roles.append(role.strip().lower())

    return normalized_roles


async def verify_user(
    request: Request,
    token: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    if token is None or token.scheme.lower() != "bearer" or not token.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    supabase_client = get_supabase_backend_client()

    try:
        user_response = await asyncio.to_thread(
            lambda: supabase_client.auth.get_user(token.credentials)
        )
    except Exception as auth_error:
        logger.warning("Supabase JWT verification failed: %s", auth_error)
        raise HTTPException(status_code=401, detail="Invalid bearer token") from auth_error

    user_id = get_supabase_user_id(user_response)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid bearer token")

    request.state.user_id = user_id
    request.state.access_token = token.credentials
    request.state.user_roles = get_supabase_user_roles(user_response)
    request.state.supabase = get_supabase_authenticated_client(token.credentials)

    return user_id


async def verify_reviewer_user(
    request: Request,
    current_user_id: str = Depends(verify_user),
) -> str:
    roles = set(getattr(request.state, "user_roles", []) or [])

    try:
        supabase_client = get_request_supabase_client(request)
        user_profile_response = await asyncio.to_thread(
            lambda: supabase_client.table("users")
            .select("role")
            .eq("id", current_user_id)
            .maybe_single()
            .execute()
        )
        profile_role = (user_profile_response.data or {}).get("role")
        if isinstance(profile_role, str) and profile_role.strip():
            roles.add(profile_role.strip().lower())
    except Exception as role_error:
        logger.warning("Reviewer role lookup failed: %s", role_error)

    if not roles.intersection(AUTHORIZED_REVIEWER_ROLES):
        raise HTTPException(status_code=401, detail="Unauthorized")

    return current_user_id


async def get_user_organization(
    request: Request,
    current_user_id: str,
) -> Dict[str, Any]:
    supabase_client = get_request_supabase_client(request)
    organization_response = await asyncio.to_thread(
        lambda: supabase_client.table("organizations")
        .select("*")
        .eq("user_id", current_user_id)
        .limit(1)
        .execute()
    )
    organization_rows = organization_response.data or []
    return organization_rows[0] if organization_rows else {}


# --- FILE PARSING ENGINE UTILITIES ---
def parse_pdf(path):
    doc = fitz.open(path)
    return "\n".join(page.get_text() for page in doc)

def parse_pptx(path):
    prs = Presentation(path)
    text = []
    for slide in prs.slides:
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                text.append(shape.text.strip())
    return "\n".join(text)

def parse_docx(path):
    doc = docx.Document(path)
    return "\n".join([p.text for p in doc.paragraphs if p.text.strip()])

def parse_excel(path):
    sheets_text = []
    
    # Using a context manager ensures Windows completely releases the file handle immediately
    with pd.ExcelFile(path) as excel_file:
        for sheet_name in excel_file.sheet_names:
            df = pd.read_excel(excel_file, sheet_name=sheet_name)
            sheets_text.append(f"--- Sheet: {sheet_name} ---\n{df.to_markdown(index=False)}")
            
    return "\n\n".join(sheets_text)

def encode_image_to_base64(path):
    with open(path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')


def secure_filename(filename: str | None) -> str:
    original_name = Path(str(filename or "upload").replace("\\", "/")).name
    sanitized_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", original_name).strip("._")
    return sanitized_name or "upload"


# --- POLYGLOT CODE ANALYSIS ENDPOINT ---
@app.post("/api/analyze-code")
async def analyze_code(
    file: UploadFile = File(...),
    current_user_id: str = Depends(verify_user),
):
    filename = secure_filename(file.filename)
    _, ext = os.path.splitext(filename.lower())

    extension_map = {
        ".py": "Python",
        ".ts": "TypeScript",
        ".tsx": "TypeScript (React/JSX)",
        ".js": "JavaScript",
        ".jsx": "JavaScript (React/JSX)",
    }
    detected_language = extension_map.get(ext, "Unknown/Generic Text")

    if file.size is None or file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Uploaded files must be 5 MB or smaller.",
        )

    try:
        file_bytes = await file.read()
        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Uploaded files must be 5 MB or smaller.",
            )

        try:
            code_content = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            code_content = file_bytes.decode("utf-8", errors="ignore")

        if not code_content.strip():
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        system_prompt = f"""
You are the MeliusAI Elite Principal Engineer. You are performing a ruthless, line-by-line production-ready code audit.
The user has uploaded a file written in: {detected_language}.

CRITICAL MULTI-LANGUAGE RULES:
- If Python: Focus on async bottlenecks, unclosed database sessions, memory leaks, and global state tracking.
- If TypeScript/React (.ts, .tsx): Focus on component re-render loops (missing useEffect dependencies), type safety bypasses caused by excessive any, race conditions, missing list array keys, and unhandled async fetches.
- If JavaScript/React (.js, .jsx): Focus on component re-render loops, race conditions, missing list array keys, unhandled promises, unsafe browser API usage, and runtime type hazards.
- All languages: Scan for leaked API keys, hardcoded credentials, broken access controls, unsafe filesystem handling, and SQL injection risks.

OUTPUT FORMAT (Strict JSON matching the dashboard UI):
{{
  "executive_summary": "Deeply technical summary evaluating the architecture of this {detected_language} asset.",
  "goods_and_strengths": ["Line-level engineering praise 1", "Line-level engineering praise 2"],
  "bads_and_flaws": ["Line-level architectural or security flaw 1", "Line-level architectural or security flaw 2"],
  "strategic_recommendations": ["Actionable refactoring strategy 1", "Actionable refactoring strategy 2"],
  "overall_score": 80
}}
"""

        completion = await async_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"File Name: {filename}\n"
                        f"Language: {detected_language}\n\n"
                        f"Raw Content:\n{code_content}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        raw_content = completion.choices[0].message.content or "{}"
        return json.loads(raw_content)
    except HTTPException:
        raise
    except json.JSONDecodeError as parse_error:
        raise HTTPException(
            status_code=502,
            detail="The code analysis model returned malformed JSON.",
        ) from parse_error
    except Exception as error:
        logger.exception("code_analysis.failed")
        raise HTTPException(status_code=500, detail=str(error)) from error


# --- EXPERT REVIEWS ENDPOINT ---
@app.post("/api/review")
async def review_portfolio_asset(
    file: UploadFile,
    current_user_id: str = Depends(verify_user),
):
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    if file.size is None or file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Uploaded files must be 5 MB or smaller.",
        )

    safe_name = secure_filename(file.filename)
    temp_file_path = upload_dir / f"{uuid.uuid4().hex}_{safe_name}"
    temporary_processing_paths = []
    code_extensions = [
        ".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".json",
        ".cpp", ".c", ".h", ".cs", ".java", ".go", ".rs", ".php",
        ".rb", ".swift", ".kt", ".sql", ".sh", ".yaml", ".yml", ".md"
    ]

    try:
        # Stream raw incoming file bytes down to local server disk storage.
        bytes_written = 0
        with open(temp_file_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break

                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    if temp_file_path.exists():
                        temp_file_path.unlink()
                    raise HTTPException(
                        status_code=413,
                        detail="Uploaded files must be 5 MB or smaller.",
                    )

                buffer.write(chunk)

        extension = temp_file_path.suffix.lower()
        content_stream = ""
        agent_mode = "General Portfolio Analyst"
        is_image = False

        # A. AGENT PARSER ROUTING GATEWAY
        if extension == ".pdf":
            content_stream = parse_pdf(temp_file_path)
            agent_mode = "Document Reviewer (PDF)"
        elif extension in [".ppt", ".pptx"]:
            content_stream = parse_pptx(temp_file_path)
            agent_mode = "Document Reviewer (PowerPoint Presentation)"
        elif extension in [".doc", ".docx"]:
            content_stream = parse_docx(temp_file_path)
            agent_mode = "Document Reviewer (Word Document)"
        elif extension in [".xls", ".xlsx"]:
            content_stream = parse_excel(temp_file_path)
            agent_mode = "Data Operations Auditor (Excel Spreadsheet)"
        elif extension in code_extensions:
            agent_mode = "Source Code Engineering Architecture Validator"
            content_stream = temp_file_path.read_text(errors="ignore")
            content_stream = f"[SOURCE CODE FILE CONTENT FRAMEWORK - {extension}]:\n\n{content_stream}"
        elif extension in [".mp4", ".m4a", ".mp3", ".wav"]:
            agent_mode = "Media Ingestion Agent (Large File Chunking Engine)"
            from pydub import AudioSegment
            import math

            processing_target = temp_file_path
            original_file_size_bytes = temp_file_path.stat().st_size
            max_media_size_bytes = 200 * 1024 * 1024
            max_chunk_size_bytes = 24 * 1024 * 1024

            if original_file_size_bytes > max_media_size_bytes:
                file_size_mb = round(original_file_size_bytes / (1024 * 1024), 2)
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Media file size ({file_size_mb} MB) exceeds the maximum supported limit of 200 MB. "
                        "Please compress your media or upload a shorter clip."
                    ),
                )

            # Phase A: Large MP4 files carry heavy video frames; strip them to an audio-only MP3 first.
            if extension == ".mp4" and original_file_size_bytes > max_chunk_size_bytes:
                try:
                    from moviepy.editor import VideoFileClip
                except ImportError:
                    from moviepy import VideoFileClip

                audio_extract_path = temp_file_path.with_suffix(".mp3")
                temporary_processing_paths.append(audio_extract_path)
                video_clip = VideoFileClip(str(temp_file_path))

                try:
                    if video_clip.audio is None:
                        raise HTTPException(status_code=400, detail="This MP4 file does not contain an extractable audio track.")

                    video_clip.audio.write_audiofile(str(audio_extract_path), bitrate="64k", logger=None)
                finally:
                    video_clip.close()

                processing_target = audio_extract_path

            # Phase B: If the processing target is under OpenAI's payload cap, transcribe directly.
            target_size_bytes = processing_target.stat().st_size

            if target_size_bytes <= max_chunk_size_bytes:
                with open(processing_target, "rb") as audio_file:
                    transcript = client.audio.transcriptions.create(model="whisper-1", file=audio_file)
                content_stream = f"[AUDIO TRANSCRIPT]:\n{transcript.text}"

            # Phase C: Long media still above the safe cap is split into sequential 15-minute MP3 chunks.
            else:
                sound = AudioSegment.from_file(str(processing_target))
                fifteen_minutes_ms = 15 * 60 * 1000
                total_duration_ms = len(sound)
                num_chunks = math.ceil(total_duration_ms / fifteen_minutes_ms)
                accumulated_transcripts = []

                for i in range(num_chunks):
                    start_time = i * fifteen_minutes_ms
                    end_time = min((i + 1) * fifteen_minutes_ms, total_duration_ms)
                    audio_chunk = sound[start_time:end_time]
                    chunk_filename = upload_dir / f"chunk_{i}_{processing_target.stem}.mp3"
                    temporary_processing_paths.append(chunk_filename)

                    audio_chunk.export(str(chunk_filename), format="mp3", bitrate="64k")

                    with open(chunk_filename, "rb") as chunk_file:
                        chunk_transcript = client.audio.transcriptions.create(model="whisper-1", file=chunk_file)

                    accumulated_transcripts.append(chunk_transcript.text)

                    if chunk_filename.exists():
                        chunk_filename.unlink()
                    if chunk_filename in temporary_processing_paths:
                        temporary_processing_paths.remove(chunk_filename)

                full_text_transcript = " ".join(accumulated_transcripts)
                content_stream = f"[SPLIT-STREAM AUDIO TRANSCRIPT]:\n{full_text_transcript}"

            if processing_target != temp_file_path and processing_target.exists():
                processing_target.unlink()
            if processing_target in temporary_processing_paths:
                temporary_processing_paths.remove(processing_target)
        elif extension in [".png", ".jpg", ".jpeg", ".webp"]:
            is_image = True
            base64_image = encode_image_to_base64(temp_file_path)
            agent_mode = "Multimodal UX/UI and Design Vision Reviewer"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format extension: {extension}")

        # B. DYNAMIC CONTENT SECURITY VALIDATION
        if not is_image and not content_stream.strip():
            raise HTTPException(status_code=400, detail="File processed successfully but yielded zero extractable text context data.")

        # High-energy, supportive peer/mentor prompt mapping with Scoring
        system_prompt = (
            "You are MeliusAI, an incredibly bright, high-energy, supportive tech mentor, and close developer friend! "
            "Your tone is warm, alive, deeply encouraging, and filled with modern developer energy. "
            "Use helpful emojis naturally throughout your sentences to keep things lively. 🔥🚀\n\n"
            "CRITICAL FORMAT RULE FOR DISCUSSING PROJECTS:\n"
            "Whenever the user asks you about their project, file asset, or asks for feedback on a piece of work, "
            "you MUST organize your friendly answer into exactly these four conversational sections in this order:\n\n"
            "📝 The Breakdown: [Write a warm, enthusiastic, friendly paragraph explaining what the file/project is and what makes it interesting from a developer's perspective!]\n\n"
            "✨ The Good Stuff: [Provide a bulleted list using encouraging emojis of the absolute wins, awesome architecture choices, or beautiful logic patterns in their work! 🙌]\n\n"
            "🌱 Growth Areas: [Provide a bulleted list of helpful, constructive tips on what can be improved or refactored. Frame it like a friendly tip over coffee! ☕]\n\n"
            "🏆 Mentor Score: [Provide an objective engineering mark out of 100 based on the quality of the asset, followed by an encouraging high-five sentence! Example: '85/100 — You are building a rock-solid foundation here, keep pushing!']\n\n"
            "Remember: Never output rigid markdown table grids or boring raw blocks. Speak like a real human teammate who has their back!"
        )

        # Assemble Payload Configuration Context shapes
        if is_image:
            mime_type = f"image/{extension.replace('.', '')}"
            user_content = [
                {"type": "text", "text": "Execute a deep architectural visual and configuration design review on this asset layout screen."},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
                }
            ]
        else:
            user_content = f"Evaluate my attached asset profile records file contents:\n\n{content_stream[:18000]}"

        # Clean up temporary disk storage allocations immediately before streaming to avoid locked file errors
        if temp_file_path.exists():
            temp_file_path.unlink()

        # D. ASYNCHRONOUS TOKEN GENERATOR FUNCTION
        def stream_generator():
            chat_stream = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.2,
                stream=True  # Unlocks chunk-by-chunk instant network emissions
            )
            for chunk in chat_stream:
                token = chunk.choices[0].delta.content
                if token:
                    yield token

        return StreamingResponse(stream_generator(), media_type="text/plain")

    except HTTPException:
        for generated_path in temporary_processing_paths:
            if generated_path.exists():
                generated_path.unlink()
        if temp_file_path.exists():
            temp_file_path.unlink()
        raise
    except Exception as error:
        # Safe cleanup block in case of pipeline processing interruptions
        for generated_path in temporary_processing_paths:
            if generated_path.exists():
                generated_path.unlink()
        if temp_file_path.exists():
            temp_file_path.unlink()
        raise HTTPException(status_code=500, detail=str(error))


# =====================================================================
# ENGINE 2: CONVERSATIONAL INTERACTIVE CHAT STATION (Context-Aware)
# =====================================================================
from pydantic import BaseModel, Field
from typing import Any, Dict, List


class UniversalAuditReport(BaseModel):
    calculatedScore: int = Field(..., ge=0, le=100)
    executiveSummary: str
    pros: List[str]
    cons: List[str]
    strategicRecommendations: List[str]


class VerifyRequest(BaseModel):
    projectId: str
    assetName: str
    assetTextContent: str
    userContextDescription: str


class MatchTalentRequest(BaseModel):
    prompt: str
    organization_id: str | None = None


class SearchRequest(BaseModel):
    query: str


class DismissOpportunityRequest(BaseModel):
    candidate_id: str | None = None
    opportunity_id: str


class CreateOpportunityRequest(BaseModel):
    job_title: str
    core_requirements: str | None = None
    description: str | None = None
    core_skills: str
    company_email: str
    organization_id: str | None = None


class UpdateOpportunityRequest(BaseModel):
    id: str
    job_title: str
    core_requirements: str
    core_skills: str


class UpdateOrganizationProfileRequest(BaseModel):
    company_name: str
    company_description: str | None = None
    company_profile_mission: str | None = None
    description: str | None = None
    org_email: str | None = None
    hiring_contact_email: str | None = None
    user_id: str | None = None
    org_id: str | None = None


class CandidateEvaluation(BaseModel):
    id: str
    full_name: str
    username: str
    bio: str
    match_score: int = Field(..., ge=0, le=100)
    ai_rationale: str
    skills: List[str]
    average_project_score: float


class MatchTalentResponse(BaseModel):
    ranked_candidates: List[CandidateEvaluation]


def serialize_pydantic_model(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()

    return model.dict()


def normalize_member_profile(row: Dict[str, Any]) -> Dict[str, Any]:
    username = row.get("username") or ""
    full_name = row.get("full_name") or username

    return {
        "status": "verified",
        "id": row.get("id"),
        "full_name": full_name,
        "username": username,
        "avatar_url": row.get("avatar_url"),
    }


def extract_match_terms(prompt: str) -> List[str]:
    raw_terms = re.findall(r"[a-zA-Z0-9+#.-]+", prompt.lower())
    stop_words = {
        "a",
        "an",
        "and",
        "are",
        "as",
        "for",
        "in",
        "of",
        "on",
        "or",
        "our",
        "the",
        "to",
        "with",
        "who",
        "need",
        "looking",
        "find",
        "candidate",
        "talent",
        "profile",
        "person",
    }

    terms = []
    for term in raw_terms:
        cleaned_term = term.strip(".,:;!?()[]{}").lower()
        if len(cleaned_term) < 2 or cleaned_term in stop_words:
            continue
        if cleaned_term not in terms:
            terms.append(cleaned_term)

    return terms[:18]


def stringify_profile_value(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, list):
        return " ".join(stringify_profile_value(item) for item in value)

    if isinstance(value, dict):
        return " ".join(stringify_profile_value(item) for item in value.values())

    return str(value)


def build_profile_embedding_text(profile: Dict[str, Any]) -> str:
    embedding_fields = [
        "bio",
        "biotext",
        "about",
        "description",
        "headline",
        "skills",
        "internal_keywords",
        "username",
        "full_name",
    ]

    raw_text_parts = [
        stringify_profile_value(profile.get(field)).strip()
        for field in embedding_fields
        if stringify_profile_value(profile.get(field)).strip()
    ]

    return " ".join(raw_text_parts).strip()


def extract_project_assessment_score(project: Dict[str, Any]) -> float | None:
    for field in ["evaluation_score", "logic_score", "technical_score", "score"]:
        value = project.get(field)
        if value is None:
            continue

        try:
            numeric_score = float(value)
        except (TypeError, ValueError):
            continue

        if 0 <= numeric_score <= 100:
            return numeric_score

    return None


def build_project_search_text(project: Dict[str, Any]) -> str:
    searchable_fields = [
        "title",
        "name",
        "description",
        "summary",
        "ai_summary",
        "tech_stack",
        "stack",
        "tags",
        "skills",
        "file_name",
        "source_kind",
        "profession",
    ]

    return " ".join(
        stringify_profile_value(project.get(field))
        for field in searchable_fields
        if stringify_profile_value(project.get(field)).strip()
    ).lower()


def get_profile_search_corpus(profile: Dict[str, Any]) -> str:
    searchable_fields = [
        "full_name",
        "username",
        "bio",
        "headline",
        "professional_headline",
        "role",
        "title",
        "skills",
        "tags",
        "tech_stack",
        "specialties",
        "internal_keywords",
        "experience",
    ]

    return " ".join(stringify_profile_value(profile.get(field)) for field in searchable_fields).lower()


def build_candidate_profile_text(profile: Dict[str, Any]) -> str:
    candidate_fields = [
        "full_name",
        "username",
        "bio",
        "headline",
        "professional_headline",
        "role",
        "target_role",
        "title",
        "skills",
        "tags",
        "tech_stack",
        "specialties",
        "internal_keywords",
        "experience",
        "experience_summary",
        "search_parameters",
        "portfolio_summary",
    ]
    return "\n".join(
        f"{field}: {stringify_profile_value(profile.get(field))}"
        for field in candidate_fields
        if stringify_profile_value(profile.get(field)).strip()
    )


def build_organization_context(organization: Dict[str, Any] | None) -> str:
    if not organization:
        return ""

    organization_fields = [
        "company_name",
        "name",
        "display_name",
        "slug",
        "bio",
        "mission",
        "industry",
        "focus",
        "specialties",
        "linked_profiles",
    ]
    return "\n".join(
        f"{field}: {stringify_profile_value(organization.get(field))}"
        for field in organization_fields
        if stringify_profile_value(organization.get(field)).strip()
    )


def cosine_similarity(left: List[float], right: List[float]) -> float:
    dot_product = sum(left_value * right_value for left_value, right_value in zip(left, right))
    left_norm = math.sqrt(sum(left_value * left_value for left_value in left))
    right_norm = math.sqrt(sum(right_value * right_value for right_value in right))

    if left_norm == 0 or right_norm == 0:
        return 0.0

    return dot_product / (left_norm * right_norm)


def fetch_openai_embeddings(texts: List[str]) -> List[List[float]]:
    embedding_response = client.embeddings.create(
        model="text-embedding-3-small",
        input=[text[:7000] for text in texts],
    )
    return [item.embedding for item in embedding_response.data]


def parse_llm_keyword_array(raw_text: str) -> List[str]:
    cleaned_text = raw_text.strip()
    cleaned_text = re.sub(r"^```(?:json)?", "", cleaned_text, flags=re.IGNORECASE).strip()
    cleaned_text = re.sub(r"```$", "", cleaned_text).strip()

    for candidate_text in [cleaned_text, cleaned_text.replace("'", '"')]:
        try:
            parsed_keywords = json.loads(candidate_text)
        except json.JSONDecodeError:
            continue

        if not isinstance(parsed_keywords, list):
            continue

        keywords = []
        for keyword in parsed_keywords:
            normalized_keyword = str(keyword).strip().lower()
            if normalized_keyword and normalized_keyword not in keywords:
                keywords.append(normalized_keyword)

        return keywords

    return []


def extract_profile_internal_keywords(bio: str) -> List[str]:
    clean_bio = bio.strip()

    if not clean_bio:
        return []

    try:
        keyword_completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an advanced HR semantic parsing layer engine for MeliusAI. Analyze the raw text "
                        "biography of this user. Extract every single industry skill, tool, programming language, "
                        "and core professional capability mentioned. Return ONLY a valid, raw JSON array of lowercase "
                        "string keywords. Do not include any introductory sentences, conversational text, or markdown "
                        "code blocks. Example Output: ['video editing', 'python', 'ui ux design', 'premiere pro']."
                    ),
                },
                {"role": "user", "content": clean_bio},
            ],
            temperature=0,
        )
        raw_keywords = keyword_completion.choices[0].message.content or "[]"
        return parse_llm_keyword_array(raw_keywords)
    except Exception as keyword_error:
        print(f"--- HR PARSER WARNING: Internal keyword extraction failed quietly: {keyword_error} ---")
        return []


def build_postgres_text_array_literal(values: List[str]) -> str:
    normalized_values = []

    for value in values:
        normalized_value = str(value).strip().lower()
        if normalized_value and normalized_value not in normalized_values:
            normalized_values.append(normalized_value)

    escaped_values = [f'"{value.replace(chr(34), chr(34) + chr(34))}"' for value in normalized_values]
    return "{" + ",".join(escaped_values) + "}"


def compute_keyword_signal(match_terms: List[str], corpus: str) -> tuple[int, List[str]]:
    matched_terms = [term for term in match_terms if term in corpus]

    if not matched_terms:
        return 0, []

    coverage_ratio = len(matched_terms) / max(len(match_terms), 1)
    density_bonus = min(sum(corpus.count(term) for term in matched_terms), 8)
    return int(coverage_ratio * 12 + density_bonus), matched_terms


def compute_feedback_boost(profile: Dict[str, Any], feedback_rows: List[Dict[str, Any]], match_terms: List[str]) -> int:
    if not feedback_rows:
        return 0

    profile_id = profile.get("id")
    corpus = get_profile_search_corpus(profile)
    boost = 0

    for row in feedback_rows[:50]:
        action = str(row.get("action", "")).lower()
        feedback_prompt_terms = extract_match_terms(str(row.get("search_prompt", "")))
        overlap_count = len([term for term in feedback_prompt_terms if term in corpus or term in match_terms])
        is_same_candidate = profile_id and row.get("candidate_id") == profile_id

        if action == "shortlisted":
            boost += (8 if is_same_candidate else 3) + min(overlap_count, 3)
        elif action == "clicked":
            boost += (5 if is_same_candidate else 2) + min(overlap_count, 2)
        elif action == "skipped" and is_same_candidate:
            boost -= 5

    return max(-8, min(boost, 15))


def build_match_tags(matched_terms: List[str], match_index: int, semantic_score: int, feedback_boost: int) -> List[str]:
    tags = []

    for term in matched_terms[:4]:
        tag_score = min(99, max(82, match_index - len(tags) * 3))
        tag_label = term.replace("_", " ").replace("-", " ").title()
        tags.append(f"{tag_label}: {tag_score}%")

    if not tags:
        tags.append(f"Semantic Alignment: {max(75, semantic_score)}%")

    if feedback_boost > 0:
        tags.append(f"Feedback Boost: +{feedback_boost}%")

    return tags[:5]


def deterministic_candidate_match(
    profiles: List[Dict[str, Any]],
    prompt: str,
    organization_context: str,
    feedback_rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    match_terms = extract_match_terms(f"{prompt} {organization_context}")
    candidates = []

    for profile in profiles:
        corpus = get_profile_search_corpus(profile)
        keyword_score, matched_terms = compute_keyword_signal(match_terms, corpus)
        feedback_boost = compute_feedback_boost(profile, feedback_rows, match_terms)
        match_index = max(60, min(99, 60 + keyword_score + feedback_boost))

        if match_index < 70:
            continue

        profile_role = (
            profile.get("headline")
            or profile.get("professional_headline")
            or profile.get("role")
            or profile.get("target_role")
            or profile.get("title")
            or profile.get("bio")
            or "Verified MeliusAI Talent"
        )

        candidates.append({
            "id": profile.get("id"),
            "full_name": profile.get("full_name") or profile.get("username") or "MeliusAI Talent",
            "username": profile.get("username") or "",
            "role": str(profile_role)[:140],
            "match_index": match_index,
            "tags": build_match_tags(matched_terms, match_index, match_index, feedback_boost),
        })

    return sorted(candidates, key=lambda candidate: candidate["match_index"], reverse=True)[:5]


@app.post("/api/profile/sync-embedding")
async def sync_single_profile_embedding(
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    data = await request.json()

    try:
        profile_id = current_user_id
        if not profile_id:
            return {"success": False, "message": "Profile vector sync skipped: missing profile id."}

        supabase = get_request_supabase_client(request)
        profile_text = build_profile_embedding_text(data)

        if not profile_text.strip():
            existing_profile = (
                supabase.table("profiles")
                .select("*")
                .eq("id", profile_id)
                .maybe_single()
                .execute()
            )
            profile_text = build_profile_embedding_text(existing_profile.data or {})

        if not profile_text.strip():
            return {"success": False, "message": "Profile vector sync skipped: no semantic profile text found."}

        print(f"--- SYNC ENGINE DEBUG: Vectorizing User '{data.get('username')}' with text length: {len(profile_text)} ---")
        internal_keywords = extract_profile_internal_keywords(str(data.get("bio", "")))
        new_embedding = fetch_openai_embeddings([profile_text])[0]
        update_payload = {"profile_embedding": new_embedding}
        if internal_keywords:
            update_payload["internal_keywords"] = internal_keywords

        supabase.table("profiles").update(update_payload).eq("id", current_user_id).execute()
        print("--- ML SUCCESS: Automatically synchronized profile vector embeddings in background thread ---")

        return {"success": True, "message": "Profile vector embedding synchronized."}
    except Exception as embedding_sync_error:
        print(f"--- ML ERROR: Profile saved, but auto-vector generation failed: {embedding_sync_error} ---")
        return {"success": False, "message": "Profile saved, but vector synchronization failed."}


@app.post("/api/search-member")
async def verify_member(
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    data = await request.json()
    print(f"--- DEBUG: Full Raw Payload Received: {data} ---")

    if isinstance(data, dict):
        raw_input = (
            data.get("meliusai_profile_link")
            or data.get("username")
            or data.get("query")
            or ""
        )
    else:
        raw_input = data or ""

    clean_handle = str(raw_input).strip()
    for prefix in ["https://melius-ai.vercel.app/profile/", "http://localhost:3000/profile/", "/profile/", "/"]:
        clean_handle = clean_handle.replace(prefix, "")
    target_username = clean_handle.strip().lower()

    print(f"--- DEBUG: Looking up clean target username: '{target_username}' ---")

    if not target_username:
        return {"success": False, "message": "No username provided."}

    supabase = get_request_supabase_client(request)
    result = supabase.table("profiles").select("*").ilike("username", target_username).execute()

    if not result.data:
        return {"success": False, "message": f"No user found with username '{target_username}'"}

    return {"success": True, "user": result.data[0]}


@app.get("/api/spectate-profile/{username}")
async def spectate_profile(
    username: str,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    try:
        target_username = username.strip().lower()

        if not target_username:
            raise HTTPException(status_code=404, detail="Target candidate profile not found")

        supabase = get_request_supabase_client(request)
        profile_query = (
            supabase.table("profiles")
            .select("*")
            .eq("username", target_username)
            .limit(1)
            .execute()
        )

        profile_rows = profile_query.data or []
        profile_data = profile_rows[0] if profile_rows else None

        if not profile_data:
            try:
                UUID(target_username)
            except ValueError:
                pass
            else:
                profile_by_id_query = (
                    supabase.table("profiles")
                    .select("*")
                    .eq("id", target_username)
                    .limit(1)
                    .execute()
                )
                profile_by_id_rows = profile_by_id_query.data or []
                profile_data = profile_by_id_rows[0] if profile_by_id_rows else None

        if not profile_data:
            raise HTTPException(status_code=404, detail="Target candidate profile not found")

        profile_id = profile_data.get("id")
        if not profile_id:
            raise HTTPException(status_code=404, detail="Target candidate profile not found")

        profile_data = {**profile_data, "email": profile_data.get("email")}

        projects_query = (
            supabase.table("projects")
            .select("*")
            .eq("user_id", str(profile_id))
            .execute()
        )
        projects = projects_query.data or []

        scans_query = (
            supabase.table("projects")
            .select("*")
            .eq("user_id", str(profile_id))
            .execute()
        )
        scan_rows = scans_query.data or []
        scans = [
            project
            for project in scan_rows
            if project.get("has_been_audited")
            or project.get("logic_score") is not None
            or project.get("evaluation_score") is not None
            or project.get("score") is not None
        ]

        return {
            "profile": profile_data,
            "projects": projects,
            "scans": scans,
        }
    except HTTPException:
        raise
    except Exception as error:
        print(f"--- SPECTATE PROFILE ERROR: {str(error)} ---")
        raise HTTPException(status_code=500, detail="Unable to load the spectator profile")


@app.get("/api/talent-discovery")
async def talent_discovery(
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    try:
        supabase = get_request_supabase_client(request)
        profile_response = await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .select(
                "id, full_name, bio, skills, avg_project_score, "
                "current_status, experience"
            )
            .order("avg_project_score", desc=True)
            .execute()
        )
        profile_rows = profile_response.data or []
        talent_payload = []

        for profile in profile_rows:
            profile_id = str(profile.get("id") or "").strip()
            if not profile_id:
                continue

            raw_skills = profile.get("skills")
            if isinstance(raw_skills, list):
                skills = [str(skill).strip() for skill in raw_skills if str(skill).strip()]
            elif isinstance(raw_skills, str):
                skills = [skill.strip() for skill in raw_skills.split(",") if skill.strip()]
            else:
                skills = []

            role = (f"{skills[0]} Specialist" if skills else None) or "Verified Talent"

            raw_experience = profile.get("experience")
            if isinstance(raw_experience, list) and len(raw_experience) >= 3:
                experience_level = "Senior"
            elif isinstance(raw_experience, list) and raw_experience:
                experience_level = "Experienced"
            elif profile.get("current_status") == "Studying":
                experience_level = "Emerging Talent"
            elif profile.get("current_status") == "Working":
                experience_level = "Professional"
            else:
                experience_level = "Verified Professional"

            try:
                average_score = float(profile.get("avg_project_score") or 0)
            except (TypeError, ValueError):
                average_score = 0.0

            talent_payload.append(
                {
                    "id": profile_id,
                    "full_name": profile.get("full_name") or "MeliusAI Talent",
                    "bio": str(profile.get("bio") or ""),
                    "role": str(role),
                    "experience_level": experience_level,
                    "skill_tags": skills,
                    "avg_project_score": round(max(0.0, min(100.0, average_score)), 1),
                }
            )

        return JSONResponse(content=talent_payload)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("talent_discovery.failed")
        raise HTTPException(
            status_code=503,
            detail="Talent discovery data source is temporarily unavailable",
        ) from error


@app.post("/api/create-opportunity", status_code=201)
async def create_opportunity(
    payload: CreateOpportunityRequest,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    job_title = payload.job_title.strip()
    core_requirements_text = (payload.core_requirements or payload.description or "").strip()
    core_skills = payload.core_skills.strip()
    company_email = payload.company_email.strip().lower()

    if not job_title or not core_requirements_text or not core_skills:
        raise HTTPException(status_code=400, detail="Job title, core requirements, and core skills are required")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", company_email):
        raise HTTPException(status_code=400, detail="A valid company email is required")

    try:
        supabase = get_request_supabase_client(request)
        organization = await get_user_organization(request, current_user_id)
        organization_id = str(organization.get("id") or current_user_id).strip()
        organization_name = (
            str(organization.get("company_name") or "").strip()
            or unquote(request.headers.get("x-company-name", "").strip())
            or "MeliusAI"
        )
        insert_data = {
            "organization_id": organization_id,
            "recruiter_name": organization_name,
            "role_title": job_title,
            "description": core_requirements_text,
            "core_skills": core_skills,
            "company_email": company_email,
            "status": "active",
        }
        opportunity_response = await asyncio.to_thread(
            lambda: supabase.table("opportunities")
            .insert(insert_data)
            .execute()
        )

        created_rows = (
            opportunity_response.data
            if isinstance(opportunity_response.data, list)
            else [opportunity_response.data] if opportunity_response.data else []
        )
        created_opportunity = created_rows[0] if created_rows else insert_data

        return JSONResponse(
            status_code=201,
            content={
                "success": True,
                "opportunity": created_opportunity,
            },
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("create_opportunity.failed")
        raise HTTPException(
            status_code=503,
            detail="Unable to broadcast this opportunity right now",
        ) from error


@app.get("/api/organization-opportunities")
async def organization_opportunities(
    request: Request,
    current_user_id: str = Depends(verify_user),
    recruiter_name: str = "",
):
    try:
        supabase = get_request_supabase_client(request)
        organization = await get_user_organization(request, current_user_id)
        organization_id = str(organization.get("id") or current_user_id).strip()
        opportunities_response = await asyncio.to_thread(
            lambda: supabase.table("opportunities")
            .select(
                "id, organization_id, recruiter_name, role_title, core_skills, "
                "company_email, status, created_at, description"
            )
            .eq("organization_id", organization_id)
            .order("created_at", desc=True)
            .execute()
        )
        return JSONResponse(content=opportunities_response.data or [])
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("organization_opportunities.failed")
        raise HTTPException(
            status_code=503,
            detail="Unable to load organization opportunities right now",
        ) from error


@app.put("/api/update-opportunity")
async def update_opportunity(
    payload: UpdateOpportunityRequest,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    opportunity_id = payload.id.strip()
    job_title = payload.job_title.strip()
    core_requirements = payload.core_requirements.strip()
    core_skills = payload.core_skills.strip()

    if not opportunity_id:
        raise HTTPException(status_code=400, detail="Opportunity id is required")
    if not job_title or not core_requirements or not core_skills:
        raise HTTPException(status_code=400, detail="Job title, core requirements, and core skills are required")

    try:
        supabase = get_request_supabase_client(request)
        organization = await get_user_organization(request, current_user_id)
        organization_id = str(organization.get("id") or current_user_id).strip()
        opportunity_response = await asyncio.to_thread(
            lambda: supabase.table("opportunities")
            .update(
                {
                    "role_title": job_title,
                    "description": core_requirements,
                    "core_skills": core_skills,
                }
            )
            .eq("id", opportunity_id)
            .eq("organization_id", organization_id)
            .execute()
        )
        updated_rows = opportunity_response.data or []
        if not updated_rows:
            raise HTTPException(status_code=404, detail="Opportunity not found")

        return JSONResponse(
            content={
                "success": True,
                "opportunity": updated_rows[0],
            }
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("update_opportunity.failed")
        raise HTTPException(
            status_code=503,
            detail="Unable to update this opportunity right now",
        ) from error


@app.delete("/api/delete-opportunity")
async def delete_opportunity(
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    opportunity_id = str(request.query_params.get("id") or "").strip()
    if not opportunity_id:
        try:
            request_data = await request.json()
        except Exception:
            request_data = {}
        if isinstance(request_data, dict):
            opportunity_id = str(request_data.get("id") or "").strip()

    if not opportunity_id:
        raise HTTPException(status_code=400, detail="Opportunity id is required")

    try:
        supabase = get_request_supabase_client(request)
        organization = await get_user_organization(request, current_user_id)
        organization_id = str(organization.get("id") or current_user_id).strip()
        await asyncio.to_thread(
            lambda: supabase.table("opportunities")
            .delete()
            .eq("id", opportunity_id)
            .eq("organization_id", organization_id)
            .execute()
        )
        return JSONResponse(
            content={
                "success": True,
                "deleted_opportunity_id": opportunity_id,
            }
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("delete_opportunity.failed")
        raise HTTPException(
            status_code=503,
            detail="Unable to delete this opportunity right now",
        ) from error


@app.post("/api/update-organization-profile")
async def update_organization_profile(
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    try:
        data = await request.json()
        bio_text = data.get("mission_text")
        company_name = data.get("company_name") or "MeliusAI"

        client = get_request_supabase_client(request)
        response = client.table("organizations").update({
            "mission_text": bio_text,
            "company_name": company_name
        }).eq("user_id", current_user_id).execute()

        if not response.data:
            response = client.table("organizations").insert({
                "company_name": company_name,
                "mission_text": bio_text,
                "user_id": current_user_id
            }).execute()
            
        return {"status": "success", "data": response.data}
        
    except Exception as e:
        print(f"Bio save failed: {str(e)}")
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})  
    

    
@app.post("/api/dismiss-opportunity")
async def dismiss_opportunity(
    payload: DismissOpportunityRequest,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    try:
        candidate_id = str(UUID(current_user_id))
        opportunity_id = str(UUID(payload.opportunity_id.strip()))
    except (ValueError, AttributeError) as identifier_error:
        raise HTTPException(
            status_code=400,
            detail="candidate_id and opportunity_id must be valid UUIDs",
        ) from identifier_error

    try:
        supabase = get_request_supabase_client(request)
        await asyncio.to_thread(
            lambda: supabase.table("candidate_opportunity_dismissals")
            .insert(
                {
                    "candidate_id": candidate_id,
                    "opportunity_id": opportunity_id,
                }
            )
            .execute()
        )
        return {
            "success": True,
            "candidate_id": candidate_id,
            "opportunity_id": opportunity_id,
        }
    except Exception as error:
        error_text = str(error)
        if "23505" in error_text or "duplicate key" in error_text.lower():
            return {
                "success": True,
                "candidate_id": candidate_id,
                "opportunity_id": opportunity_id,
            }

        logger.exception("dismiss_opportunity.failed")
        if "PGRST205" in error_text:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Opportunity dismissals are not available yet. Apply migration "
                    "202606220001_candidate_opportunity_dismissals.sql and reload the PostgREST schema."
                ),
            ) from error

        raise HTTPException(
            status_code=503,
            detail="Unable to persist this opportunity dismissal",
        ) from error


@app.get("/api/get-opportunities")
async def get_opportunities(
    request: Request,
    current_user_id: str = Depends(verify_user),
    candidate_id: str | None = None,
):
    resolved_candidate_id = current_user_id.strip()
    if not resolved_candidate_id:
        raise HTTPException(status_code=400, detail="Candidate profile id is required")

    try:
        supabase = get_request_supabase_client(request)

        profile_response = await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .select("skills")
            .eq("id", resolved_candidate_id)
            .single()
            .execute()
        )
        candidate_profile = profile_response.data or {}
        if not isinstance(candidate_profile, dict) or not candidate_profile:
            raise HTTPException(status_code=404, detail="Candidate profile not found")

        raw_skills = candidate_profile.get("skills")
        if isinstance(raw_skills, list):
            candidate_skills = [str(skill).strip().lower() for skill in raw_skills if str(skill).strip()]
        elif isinstance(raw_skills, str):
            candidate_skills = [skill.strip().lower() for skill in raw_skills.split(",") if skill.strip()]
        else:
            candidate_skills = []

        unique_skills = list(dict.fromkeys(candidate_skills))
        try:
            dismissals_response = await asyncio.to_thread(
                lambda: supabase.table("candidate_opportunity_dismissals")
                .select("opportunity_id")
                .eq("candidate_id", resolved_candidate_id)
                .execute()
            )
        except Exception as dismissal_lookup_error:
            if "PGRST205" not in str(dismissal_lookup_error):
                raise

            logger.warning(
                "Opportunity dismissal table is not in the PostgREST schema cache yet."
            )
            dismissals_response = None

        dismissed_opportunity_ids = {
            str(dismissal.get("opportunity_id") or "")
            for dismissal in ((dismissals_response.data or []) if dismissals_response else [])
            if dismissal.get("opportunity_id")
        }
        opportunities_response = await asyncio.to_thread(
            lambda: supabase.table("opportunities")
            .select("*, organization_id")
            .eq("status", "active")
            .order("created_at", desc=True)
            .execute()
        )

        matched_alerts = []
        manifesto_by_recruiter = {}
        for opportunity in opportunities_response.data or []:
            if str(opportunity.get("id") or "") in dismissed_opportunity_ids:
                continue

            role_title = str(opportunity.get("role_title") or "").lower()
            required_skills = list(
                dict.fromkeys(
                    skill.strip().lower()
                    for skill in str(opportunity.get("core_skills") or "").split(",")
                    if skill.strip()
                )
            )

            matched_skills = []
            matched_requirement_count = 0
            for required_skill in required_skills:
                matching_user_skill = next(
                    (
                        user_skill
                        for user_skill in unique_skills
                        if user_skill == required_skill
                        or user_skill in required_skill
                        or required_skill in user_skill
                    ),
                    None,
                )
                if matching_user_skill:
                    matched_requirement_count += 1
                    if matching_user_skill not in matched_skills:
                        matched_skills.append(matching_user_skill)

            if required_skills and not matched_skills:
                continue

            if not required_skills:
                matched_skills = [skill for skill in unique_skills if skill and skill in role_title]

            organic_match_score = 0
            if required_skills:
                base_compatibility = 38
                skill_weight = 62
                skill_score = (matched_requirement_count / len(required_skills)) * skill_weight
                experience_modifier = min(len(unique_skills) * 0.8, 5)
                organic_match_score = int(
                    math.floor(base_compatibility + skill_score + experience_modifier + 0.5)
                )
                organic_match_score = max(0, min(99, organic_match_score))
            else:
                organic_match_score = 82

            match_explanation = (
                f"Matches your skills: {', '.join(matched_skills)}"
                if matched_skills
                else "Broad role alignment based on your verified profile."
            )

            recruiter_name = str(opportunity.get("recruiter_name") or "").strip()
            recruiter_key = recruiter_name.casefold()
            if recruiter_name and recruiter_key not in manifesto_by_recruiter:
                organization_response = await asyncio.to_thread(
                    lambda: supabase.table("organizations")
                    .select("id, mission_text, pillar1_title, tech_input, perks_input")
                    .ilike("company_name", recruiter_name)
                    .limit(1)
                    .execute()
                )
                organization_rows = organization_response.data or []
                manifesto_by_recruiter[recruiter_key] = (
                    organization_rows[0] if organization_rows else {}
                )

            manifesto = manifesto_by_recruiter.get(recruiter_key, {})
            organization_id = str(
                opportunity.get("organization_id") or manifesto.get("id") or ""
            ).strip()
            matched_alerts.append(
                {
                    **opportunity,
                    "organization_id": organization_id,
                    "mission_text": str(manifesto.get("mission_text") or ""),
                    "pillar1_title": str(manifesto.get("pillar1_title") or ""),
                    "tech_input": str(manifesto.get("tech_input") or ""),
                    "perks_input": str(manifesto.get("perks_input") or ""),
                    "match_score": organic_match_score,
                    "matched_skills": matched_skills,
                    "triggered_skills": matched_skills,
                    "match_explanation": match_explanation,
                }
            )

        matched_alerts.sort(
            key=lambda opportunity: opportunity["match_score"],
            reverse=True,
        )
        return JSONResponse(content=matched_alerts)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("get_opportunities.failed")
        raise HTTPException(
            status_code=503,
            detail="Unable to load matching opportunities right now",
        ) from error


@app.post("/api/verify-asset")
async def verify_asset(
    payload: VerifyRequest,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    try:
        project_id = payload.projectId.strip()
        asset_name = payload.assetName.strip() or "Project Asset"
        asset_text_content = payload.assetTextContent.strip()
        user_context_description = payload.userContextDescription.strip()

        if not project_id or not asset_text_content:
            raise HTTPException(
                status_code=400,
                detail="projectId and assetTextContent are required.",
            )

        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            response_format=UniversalAuditReport,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are MeliusAI's Principal Smart Asset Verification Engine. "
                        "You must evaluate every submitted asset against ONE unified industry-standard benchmark "
                        "regardless of file format, whether the source is a DOCX document, XLSX spreadsheet, "
                        "source code file, image, presentation, or MP4/video transcript. "
                        "Metric A: Structural Completeness & Technical Accuracy. "
                        "Metric B: Practical Real-World Execution relative to the user's project description intent. "
                        "Metric C: Optimization, Corporate Standards, and Delivery Quality. "
                        "Return a strict structured JSON object matching the provided schema. "
                        "executiveSummary must be clean professional Markdown and MUST be an elegant high-level overview, "
                        "strictly limited to 3 to 4 short lines maximum. It must not detail specific bullet points, pros, cons, fixes, or score metrics. "
                        "pros must ONLY contain absolute positive strengths currently present in the file. Never include missing items, flaws, or suggestions to add/fix/change anything in pros. "
                        "cons must ONLY contain specific existing flaws, errors, missing information, weak evidence, or structural failures. "
                        "strategicRecommendations must ONLY contain actionable fixes such as 'Add a clear title' or 'Fix inconsistent formatting'. Never put action verbs or fix instructions in pros. "
                        "Zero duplication rule: a single insight cannot exist in more than one array. If something is missing, place the gap in cons and the fix in strategicRecommendations; it must never touch pros. "
                        "Keep every section unique, punchy, non-wordy, and short. "
                        "calculatedScore must be an integer from 0 to 100."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Asset Name:\n{asset_name}\n\n"
                        f"User Project Description / Intent:\n"
                        f"{user_context_description or 'No user-written project description was supplied.'}\n\n"
                        f"Raw Asset Text Content:\n{asset_text_content[:24000]}"
                    ),
                },
            ],
            temperature=0.1,
        )

        audit_report = completion.choices[0].message.parsed

        if audit_report is None:
            raise RuntimeError("OpenAI structured parser returned an empty audit report.")

        audit_payload = serialize_pydantic_model(audit_report)
        project_id_filter = str(project_id)
        supabase = get_request_supabase_client(request)

        update_payload = {
            "score": audit_report.calculatedScore,
            "audit_summary": audit_report.executiveSummary,
            "pros": list(audit_report.pros),
            "cons": list(audit_report.cons),
            "recommendations": list(audit_report.strategicRecommendations),
            "user_description": user_context_description,
            "status": "Verified",
        }

        await asyncio.to_thread(
            lambda: supabase.table("projects")
            .update(update_payload)
            .eq("id", project_id_filter)
            .or_(f"owner_id.eq.{current_user_id},user_id.eq.{current_user_id}")
            .execute()
        )

        return {"success": True, "report": audit_payload}

    except HTTPException:
        raise
    except Exception as error:
        logger.exception("verify_asset.failed")
        raise HTTPException(status_code=500, detail=str(error))


def normalize_searchable_values(value: Any) -> List[str]:
    if isinstance(value, list):
        raw_values = value
    elif isinstance(value, str):
        raw_values = value.split(",")
    else:
        return []

    normalized_values = []
    for item in raw_values:
        normalized_item = re.sub(r"\s+", " ", str(item).strip().lower())
        if normalized_item and normalized_item not in normalized_values:
            normalized_values.append(normalized_item)

    return normalized_values


def search_terms_are_similar(target_term: str, candidate_term: str) -> bool:
    if target_term == candidate_term:
        return True

    if target_term in candidate_term or candidate_term in target_term:
        return True

    simplified_target = re.sub(r"[^a-z0-9]+", " ", target_term).strip()
    simplified_candidate = re.sub(r"[^a-z0-9]+", " ", candidate_term).strip()
    if min(len(simplified_target), len(simplified_candidate)) >= 2 and (
        simplified_target in simplified_candidate
        or simplified_candidate in simplified_target
    ):
        return True

    return SequenceMatcher(None, target_term, candidate_term).ratio() >= 0.78


def score_search_terms(target_terms: List[str], candidate_values: Any) -> int:
    normalized_candidate_values = normalize_searchable_values(candidate_values)

    return sum(
        1
        for target_term in target_terms
        if any(
            search_terms_are_similar(target_term, candidate_term)
            for candidate_term in normalized_candidate_values
        )
    )


async def fetch_search_candidates(supabase) -> List[Dict[str, Any]]:
    response = await asyncio.to_thread(
        lambda: (
            supabase.table("profiles")
            .select(
                "id, full_name, username, current_status, bio, skills, "
                "extracted_experience, extracted_preferences, avg_project_score"
            )
            .execute()
        )
    )
    return response.data if isinstance(response.data, list) else []


def rank_search_candidates(
    candidates: List[Dict[str, Any]],
    search_intent: Dict[str, Any],
) -> List[Dict[str, Any]]:
    target_skills = search_intent.get("target_skills", [])
    target_experience = search_intent.get("target_experience", [])
    target_preferences = search_intent.get("target_preferences", [])
    target_name = str(search_intent.get("target_name") or "").strip().lower().lstrip("@")
    total_targets = len(target_skills) + len(target_experience) + len(target_preferences)

    if total_targets == 0 and not target_name:
        return [
            {
                **candidate,
                "match_score": 0,
                "match_percentage": 0,
                "is_exact_name_match": False,
            }
            for candidate in candidates
        ]

    scored_candidates = []
    for candidate in candidates:
        candidate_full_name = str(candidate.get("full_name") or "").strip().lower()
        candidate_username = str(candidate.get("username") or "").strip().lower().lstrip("@")
        is_exact_name_match = bool(
            target_name
            and (
                target_name in candidate_full_name
                or target_name in candidate_username
            )
        )

        if is_exact_name_match:
            scored_candidates.append(
                {
                    **candidate,
                    "match_score": 999,
                    "match_percentage": 100,
                    "is_exact_name_match": True,
                }
            )
            continue

        if total_targets == 0:
            continue

        match_score = 0
        match_score += score_search_terms(target_skills, candidate.get("skills"))
        match_score += score_search_terms(
            target_experience,
            candidate.get("extracted_experience"),
        )
        match_score += score_search_terms(
            target_preferences,
            candidate.get("extracted_preferences"),
        )

        if total_targets >= 2 and match_score < 2:
            continue

        if total_targets == 1 and match_score == 0:
            continue

        match_percentage = int((match_score / total_targets) * 100)
        scored_candidates.append(
            {
                **candidate,
                "match_score": match_score,
                "match_percentage": match_percentage,
                "is_exact_name_match": False,
            }
        )

    return sorted(
        scored_candidates,
        key=lambda candidate: (
            candidate["match_percentage"],
            candidate["match_score"],
        ),
        reverse=True,
    )


@app.post("/api/search-talent")
async def search_talent(
    payload: SearchRequest,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    query = payload.query.strip()
    supabase = get_request_supabase_client(request)

    if not query:
        return await fetch_search_candidates(supabase)

    search_intent = await parse_search_query(query)
    candidates = await fetch_search_candidates(supabase)
    return rank_search_candidates(candidates, search_intent)


@app.post("/api/match-talent")
async def match_talent(
    payload: MatchTalentRequest,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    prompt = payload.prompt.strip()

    if len(prompt) == 0:
        raise HTTPException(status_code=400, detail="Please add new information to bring clarity.")

    request_started_at = time.perf_counter()
    print(f"--- MATCH TALENT: Request received. Prompt length={len(prompt)} ---")

    try:
        openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        supabase = get_request_supabase_client(request)

        def normalize_skill_list(value: Any) -> List[str]:
            if isinstance(value, list):
                return [str(skill).strip() for skill in value if str(skill).strip()]

            if isinstance(value, str):
                return [skill.strip() for skill in value.split(",") if skill.strip()]

            return []

        def get_average_project_score(profile: Dict[str, Any]) -> float:
            raw_score = profile.get(
                "average_project_score",
                profile.get("avg_project_score", profile.get("avg_score", 0)),
            )

            try:
                score = float(raw_score or 0)
            except (TypeError, ValueError):
                score = 0.0

            return max(0.0, min(100.0, score))

        embedding_started_at = time.perf_counter()
        print("--- MATCH TALENT: Generating recruiter requirement embedding. ---")
        embedding_response = await asyncio.to_thread(
            lambda: openai_client.embeddings.create(
                input=prompt,
                model="text-embedding-3-small",
            )
        )
        query_embedding = embedding_response.data[0].embedding
        print(
            "--- MATCH TALENT: Embedding generated. "
            f"dimensions={len(query_embedding)} latency_ms={round((time.perf_counter() - embedding_started_at) * 1000, 2)} ---"
        )

        rpc_started_at = time.perf_counter()
        print("--- MATCH TALENT: Calling Supabase RPC match_candidates for top-20 prefilter. ---")
        supabase_response = await asyncio.to_thread(
            lambda: supabase.rpc(
                "match_candidates",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": 0.25,
                    "match_count": 20,
                },
            ).execute()
        )
        top_candidates = supabase_response.data if isinstance(supabase_response.data, list) else []
        print(
            "--- MATCH TALENT: RPC prefilter completed. "
            f"candidate_count={len(top_candidates)} latency_ms={round((time.perf_counter() - rpc_started_at) * 1000, 2)} ---"
        )

        if not top_candidates:
            return []

        candidate_ids = [
            str(candidate.get("id") or candidate.get("candidate_id") or candidate.get("profile_id"))
            for candidate in top_candidates
            if candidate.get("id") or candidate.get("candidate_id") or candidate.get("profile_id")
        ]
        profile_rows_response = await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .select(
                "id, full_name, username, bio, skills, extracted_experience, "
                "extracted_preferences, avg_project_score"
            )
            .in_("id", candidate_ids)
            .execute()
        )
        authoritative_profiles = {
            str(profile.get("id")): profile
            for profile in (profile_rows_response.data or [])
            if profile.get("id")
        }
        enriched_candidates = []

        for candidate in top_candidates:
            candidate_id = str(candidate.get("id") or candidate.get("candidate_id") or candidate.get("profile_id") or "")
            database_profile = authoritative_profiles.get(candidate_id, {})
            enriched_candidates.append({**candidate, **database_profile})

        candidates_by_id = {
            str(candidate.get("id") or candidate.get("candidate_id") or candidate.get("profile_id")): candidate
            for candidate in enriched_candidates
            if candidate.get("id") or candidate.get("candidate_id") or candidate.get("profile_id")
        }
        candidate_context = []

        for profile in enriched_candidates[:20]:
            candidate_id = str(profile.get("id") or profile.get("candidate_id") or profile.get("profile_id") or "")
            candidate_context.append({
                "id": candidate_id,
                "username": profile.get("username") or "",
                "full_name": profile.get("full_name") or profile.get("username") or "MeliusAI Talent",
                "bio": str(profile.get("bio") or "")[:1600],
                "skills": normalize_skill_list(profile.get("skills")),
                "extracted_experience": normalize_skill_list(profile.get("extracted_experience")),
                "extracted_preferences": normalize_skill_list(profile.get("extracted_preferences")),
                "average_project_score": get_average_project_score(profile),
                "vector_similarity": profile.get("similarity") or profile.get("match_score") or profile.get("vector_match"),
            })

        completion_started_at = time.perf_counter()
        print("--- MATCH TALENT: Starting GPT-4o-mini cognitive reranking. ---")
        completion = await asyncio.to_thread(
            lambda: openai_client.beta.chat.completions.parse(
                model="gpt-4o-mini",
                response_format=MatchTalentResponse,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are MeliusAI's Elite Technical Headhunter executing a deep architectural vetting sweep. "
                            "Return strict structured JSON matching the response schema. "
                            "Matrix Constraint A (Bio Synthesis): Analyze the core engineering/design principles, methodology, "
                            "domain experience, and professional philosophy hidden inside each candidate bio. Move far beyond basic keyword matching. "
                            "Matrix Constraint B (Project Metrics Vetting): Meticulously cross-check average_project_score. "
                            "Heavily reward candidates with scores above 85 because they prove verified execution quality. "
                            "Aggressively dock match_score for weak, missing, or poor project verification metrics, even if keywords align. "
                            "Matrix Constraint C (Custom Rationale): Craft a concise, high-signal 1-2 sentence ai_rationale showing the recruiter exactly why the candidate was ranked there. "
                            "Use the recruiter's requirement prompt to evaluate seniority, tech stack, design ethos, and delivery expectations. "
                            "Return only candidates from the supplied id values. Sort ranked_candidates from strongest to weakest. "
                            "CRITICAL RATING GRANULARITY: Calculate the 'match_score' as a highly specific, continuous integer from 0 to 100. "
                            "DO NOT round the final score to the nearest 5 or 10. Avoid lazy uniform outputs like 10, 20, 50, or 80. "
                            "Instead, compute precise, non-standard integers based on exact micro-alignments (e.g., 72, 73, 86, 91, 94). "
                            "Every single point difference must represent a real difference in asset quality, skill matching, and bio alignment. "
                            "skills must contain the specific matched skills or capabilities."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Recruiter Requirement Prompt:\n{prompt}\n\n"
                            "Candidate Pool JSON:\n"
                            f"{json.dumps(candidate_context, ensure_ascii=False)}"
                        ),
                    },
                ],
                temperature=0.1,
            )
        )
        parsed_response = completion.choices[0].message.parsed

        if parsed_response is None:
            raise RuntimeError("OpenAI structured reranker returned an empty payload.")

        evaluations = sorted(
            parsed_response.ranked_candidates,
            key=lambda candidate: candidate.match_score,
            reverse=True,
        )
        response_payload = []

        for evaluation in evaluations:
            evaluation_id = str(evaluation.id)
            source_profile = candidates_by_id.get(evaluation_id)
            database_profile = authoritative_profiles.get(evaluation_id)

            if not source_profile or not database_profile:
                continue

            score = max(0, min(100, int(evaluation.match_score)))
            normalized_score = score / 100
            skills = [skill for skill in evaluation.skills if str(skill).strip()] or normalize_skill_list(source_profile.get("skills"))
            average_project_score = get_average_project_score(source_profile)

            response_payload.append({
                "id": str(source_profile.get("id") or source_profile.get("candidate_id") or source_profile.get("profile_id")),
                "candidate_id": str(evaluation.id),
                "full_name": source_profile.get("full_name") or evaluation.full_name,
                "fullName": evaluation.full_name,
                "username": str(database_profile.get("username") or ""),
                "bio": source_profile.get("bio") or evaluation.bio,
                "skills": skills,
                "skillsMatched": skills,
                "extracted_experience": normalize_skill_list(source_profile.get("extracted_experience")),
                "extracted_preferences": normalize_skill_list(source_profile.get("extracted_preferences")),
                "avg_project_score": average_project_score,
                "average_project_score": average_project_score,
                "matchScore": score,
                "match_score": score,
                "match_index": score,
                "vector_match": normalized_score,
                "composite_match_index": normalized_score,
                "aiRationale": evaluation.ai_rationale,
                "aiReasoning": evaluation.ai_rationale,
                "ai_rationale": evaluation.ai_rationale,
                "tags": skills[:5] + [f"Avg Score: {round(average_project_score)}/100"],
            })

        sorted_payload = sorted(response_payload, key=lambda candidate: candidate["match_score"], reverse=True)
        print(
            "--- MATCH TALENT: Cognitive reranking completed. "
            f"candidate_count={len(sorted_payload)} "
            f"llm_latency_ms={round((time.perf_counter() - completion_started_at) * 1000, 2)} "
            f"total_latency_ms={round((time.perf_counter() - request_started_at) * 1000, 2)} ---"
        )

        return sorted_payload
    except HTTPException:
        raise
    except Exception as error:
        print(f"--- MATCH TALENT ERROR: {str(error)} ---")
        logger.exception("match_talent.reranker.failed")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute two-stage hybrid talent ranking payload: {str(error)}",
        )

@app.post("/api/match-feedback")
async def match_feedback(
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    try:
        data = await request.json()
        candidate_id = data.get("candidate_id") if isinstance(data, dict) else None
        search_prompt = str(data.get("search_prompt", "") if isinstance(data, dict) else "").strip()
        action = str(data.get("action", "") if isinstance(data, dict) else "").strip().lower()
        organization = await get_user_organization(request, current_user_id)
        organization_id = str(organization.get("id") or current_user_id).strip()

        if not organization_id or not candidate_id or not search_prompt or action not in ["clicked", "shortlisted", "skipped"]:
            return {"success": False, "message": "Invalid matching feedback payload."}

        supabase = get_request_supabase_client(request)
        supabase.table("matching_feedback").insert({
            "organization_id": organization_id,
            "candidate_id": candidate_id,
            "search_prompt": search_prompt,
            "action": action,
        }).execute()

        return {"success": True, "message": "Matching feedback captured."}
    except Exception as error:
        print(f"--- MATCH FEEDBACK ERROR: {str(error)} ---")
        return {"success": False, "message": "Failed to persist matching feedback signal."}


def parse_supabase_timestamp(value):
    if not value:
        return None

    try:
        normalized_value = str(value).replace("Z", "+00:00")
        parsed_value = datetime.fromisoformat(normalized_value)

        if parsed_value.tzinfo is None:
            return parsed_value.replace(tzinfo=timezone.utc)

        return parsed_value
    except ValueError:
        return None


@app.get("/api/organization-invitations")
async def organization_invitations(
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    organization = await get_user_organization(request, current_user_id)
    organization_id = str(organization.get("id") or current_user_id).strip()

    if not organization_id:
        return {"success": False, "message": "organization_id is required.", "invitations": []}

    supabase = get_request_supabase_client(request)
    invitation_result = (
        supabase.table("organization_invitations")
        .select("*")
        .eq("organization_id", organization_id)
        .order("created_at", desc=True)
        .execute()
    )
    invitations = invitation_result.data or []
    invited_profile_ids = [
        invitation.get("invited_profile_id")
        for invitation in invitations
        if invitation.get("invited_profile_id")
    ]
    profiles_by_id = {}

    if invited_profile_ids:
        profiles_result = (
            supabase.table("profiles")
            .select("id, full_name, username, avatar_url")
            .in_("id", invited_profile_ids)
            .execute()
        )
        profiles_by_id = {
            profile.get("id"): profile
            for profile in (profiles_result.data or [])
            if profile.get("id")
        }

    now = datetime.now(timezone.utc)
    hydrated_invitations = []

    for invitation in invitations:
        output_invitation = dict(invitation)
        expires_at = parse_supabase_timestamp(invitation.get("expires_at"))

        if invitation.get("status") == "pending" and expires_at and now > expires_at:
            output_invitation["status"] = "expired"

            try:
                supabase.table("organization_invitations").update({"status": "expired"}).eq("id", invitation.get("id")).execute()
            except Exception as update_error:
                print(f"--- WARNING: Failed to update expired invitation {invitation.get('id')}: {update_error} ---")

        output_invitation["profile"] = profiles_by_id.get(invitation.get("invited_profile_id"))
        hydrated_invitations.append(output_invitation)

    return {"success": True, "invitations": hydrated_invitations}


@app.post("/api/cancel-invitation")
async def cancel_invitation(
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    data = await request.json()
    invitation_id = data.get("id")

    if not invitation_id:
        return {"success": False, "message": "Invitation id is required."}

    supabase = get_request_supabase_client(request)
    organization = await get_user_organization(request, current_user_id)
    organization_id = str(organization.get("id") or current_user_id).strip()
    supabase.table("organization_invitations").update({"status": "cancelled"}).eq("id", invitation_id).eq("organization_id", organization_id).execute()

    return {"success": True, "message": "Invitation cancelled successfully."}


class ChatHistoryRequest(BaseModel):
    messages: List[Dict[str, str]]


class MessageSendSchema(BaseModel):
    room_id: str
    sender_id: str | None = None
    message_text: str
    organization_id: str | None = None
    candidate_id: str | None = None


@app.get("/api/chat/rooms/{user_id}")
async def get_chat_rooms(
    user_id: str,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    try:
        candidate_id = current_user_id.strip()
        if not candidate_id:
            raise HTTPException(status_code=400, detail="user_id is required")

        supabase = get_request_supabase_client(request)
        rooms_query = (
            supabase.table("chat_rooms")
            .select("*")
            .eq("candidate_id", candidate_id)
            .execute()
        )
        rooms = rooms_query.data or []
        enriched_rooms = []

        for room in rooms:
            room_id = room.get("id")
            organization_id = room.get("organization_id") or room.get("company_id")
            recruiter_id = room.get("recruiter_id") or room.get("sender_id")
            company_record = None
            latest_message = None

            if room_id:
                latest_message_query = (
                    supabase.table("messages")
                    .select("*")
                    .eq("room_id", str(room_id))
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                latest_message_rows = latest_message_query.data or []
                latest_message = latest_message_rows[0] if latest_message_rows else None

            if organization_id:
                organization_query = (
                    supabase.table("organizations")
                    .select("*")
                    .eq("id", str(organization_id))
                    .limit(1)
                    .execute()
                )
                organization_rows = organization_query.data or []
                company_record = organization_rows[0] if organization_rows else None

            if not company_record and (recruiter_id or organization_id):
                profile_id = recruiter_id or organization_id
                profile_query = (
                    supabase.table("profiles")
                    .select("*")
                    .eq("id", str(profile_id))
                    .limit(1)
                    .execute()
                )
                profile_rows = profile_query.data or []
                company_record = profile_rows[0] if profile_rows else None

            company_record = company_record or {}
            company_name = company_record.get("company_name") or company_record.get("full_name")
            company_avatar = (
                company_record.get("avatar_url")
                or company_record.get("logo_url")
                or company_record.get("company_logo_url")
            )
            enriched_rooms.append(
                {
                    **room,
                    "last_message_text": (
                        room.get("last_message_text")
                        or room.get("last_message")
                        or (latest_message or {}).get("message_text")
                    ),
                    "company": {
                        "id": company_record.get("id") or organization_id or recruiter_id,
                        "company_name": company_name,
                        "full_name": company_record.get("full_name"),
                        "avatar_url": company_avatar,
                    },
                }
            )

        return {"rooms": enriched_rooms}
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("chat_rooms.fetch_failed")
        raise HTTPException(status_code=500, detail="Unable to load active chat rooms") from error


@app.get("/api/chat/messages/{room_id}")
async def get_chat_messages(
    room_id: str,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    try:
        target_room_id = room_id.strip()
        if not target_room_id:
            raise HTTPException(status_code=400, detail="room_id is required")

        supabase = get_request_supabase_client(request)
        organization = await get_user_organization(request, current_user_id)
        organization_id = str(organization.get("id") or current_user_id).strip()
        room_lookup = (
            supabase.table("chat_rooms")
            .select("*")
            .eq("id", target_room_id)
            .limit(1)
            .execute()
        )
        room_rows = room_lookup.data or []
        room_record = room_rows[0] if room_rows else None
        if not room_record or (
            str(room_record.get("candidate_id") or "") != current_user_id
            and str(room_record.get("organization_id") or room_record.get("company_id") or "") != organization_id
            and str(room_record.get("recruiter_id") or room_record.get("sender_id") or "") != current_user_id
        ):
            raise HTTPException(status_code=401, detail="Unauthorized")

        messages_query = (
            supabase.table("messages")
            .select("*")
            .eq("room_id", target_room_id)
            .order("created_at", desc=False)
            .execute()
        )

        return {"messages": messages_query.data or []}
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("chat_messages.fetch_failed")
        raise HTTPException(status_code=500, detail="Unable to load chat messages") from error


@app.post("/api/chat/send", status_code=201)
async def send_chat_message(
    payload: MessageSendSchema,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    try:
        requested_room_id = payload.room_id.strip()
        sender_id = current_user_id
        message_text = payload.message_text.strip()
        supabase = get_request_supabase_client(request)
        organization = await get_user_organization(request, current_user_id)
        organization_id = str(organization.get("id") or "").strip()
        candidate_id = (payload.candidate_id or "").strip()

        if not requested_room_id or not message_text:
            raise HTTPException(
                status_code=400,
                detail="room_id and message_text are required",
            )

        room_lookup = (
            supabase.table("chat_rooms")
            .select("*")
            .eq("id", requested_room_id)
            .limit(1)
            .execute()
        )
        room_rows = room_lookup.data or []
        room_record = room_rows[0] if room_rows else None

        if not room_record:
            if not organization_id:
                raise HTTPException(status_code=401, detail="Unauthorized")

            candidate_id = candidate_id or requested_room_id

            matching_room_query = (
                supabase.table("chat_rooms")
                .select("*")
                .eq("organization_id", organization_id)
                .eq("candidate_id", candidate_id)
                .limit(1)
                .execute()
            )
            matching_room_rows = matching_room_query.data or []
            room_record = matching_room_rows[0] if matching_room_rows else None

        if not room_record:
            candidate_lookup = (
                supabase.table("profiles")
                .select("id")
                .eq("id", candidate_id)
                .limit(1)
                .execute()
            )
            if not (candidate_lookup.data or []):
                raise HTTPException(status_code=404, detail="Candidate profile not found")

            create_room_query = (
                supabase.table("chat_rooms")
                .insert(
                    {
                        "organization_id": organization_id,
                        "candidate_id": candidate_id,
                    }
                )
                .select("*")
                .single()
                .execute()
            )
            room_record = create_room_query.data

        resolved_room_id = str((room_record or {}).get("id") or "").strip()
        if not resolved_room_id:
            raise RuntimeError("Chat room resolution returned no room id")

        if (
            str(room_record.get("candidate_id") or "") != current_user_id
            and str(room_record.get("organization_id") or room_record.get("company_id") or "") != organization_id
            and str(room_record.get("recruiter_id") or room_record.get("sender_id") or "") != current_user_id
        ):
            raise HTTPException(status_code=401, detail="Unauthorized")

        message_payload = {
            "room_id": resolved_room_id,
            "sender_id": sender_id,
            "message_text": message_text,
        }
        insert_query = (
            supabase.table("messages")
            .insert(message_payload)
            .select("*")
            .single()
            .execute()
        )

        return {
            "message": insert_query.data,
            "room_id": resolved_room_id,
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("chat_messages.send_failed")
        raise HTTPException(status_code=500, detail="Unable to send chat message") from error


@app.post("/api/chat")
async def interactive_chat_station(
    request: ChatHistoryRequest,
    current_user_id: str = Depends(verify_user),
):
    try:
        system_prompt = (
            "You are MeliusAI, an incredibly bright, high-energy, supportive tech mentor, and close developer friend! "
            "Your tone is warm, alive, deeply encouraging, and filled with modern developer energy. 🔥🚀\n\n"
            "CRITICAL DYNAMIC ROUTING RULES:\n"
            "1. THE GENERAL EVALUATION CASE: If the user requests a 'full review', output sections for "
            "📝 The Breakdown, ✨ The Good Stuff, 🌱 Growth Areas, and 🏆 Mentor Score.\n"
            "2. THE TARGETED FOLLOW-UP CASE: If the user asks a specific continuous or follow-up question "
            "(e.g., 'tell me what could be improved to make it better'), BYPASS the full template layout. "
            "Answer their question directly, conversationally, and naturally like an engineering peer over coffee! ☕"
        )

        # 🛠️ INNER GENERATOR CORE INTEGRITY PROTECTION
        def stream_generator():
            try:
                chat_stream = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[{"role": "system", "content": system_prompt}] + request.messages,
                    temperature=0.8,
                    stream=True
                )
                for chunk in chat_stream:
                    if chunk.choices and len(chunk.choices) > 0:
                        token = chunk.choices[0].delta.content
                        if token:
                            yield token
            except Exception as inner_stream_error:
                # Catch errors inside the thread context and pass them safely as text tokens
                yield (
                    "\n\n⚠️ MeliusAI stream recovery notice: "
                    f"{str(inner_stream_error)}"
                )

        return StreamingResponse(stream_generator(), media_type="text/plain")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/sync-embeddings")
async def sync_database_embeddings(
    request: Request,
    current_user_id: str = Depends(verify_reviewer_user),
):
    try:
        supabase = get_request_supabase_client(request)
        
        # 1. Pull all records from the profiles table
        response = supabase.table("profiles").select("*").execute()
        profiles_list = response.data or []
        
        print(f"--- SYNC ROOT: Found {len(profiles_list)} total rows inside profiles table ---")
        
        updated_count = 0
        for profile in profiles_list:
            user_id = profile.get("id")
            username = profile.get("username") or "Unknown"
            
            # 2. Aggressively extract text fields and flatten array columns (text[])
            text_chunks = []
            
            # Inspect every potential column layout target
            target_fields = ["bio", "biotext", "about", "headline", "experience", "hobbies", "skills"]
            for field in target_fields:
                val = profile.get(field)
                if val:
                    if isinstance(val, list):
                        # Convert postgres array strings ["A", "B"] into plain sentences
                        flattened = " ".join(str(x) for x in val if x)
                        text_chunks.append(f"{field}: {flattened}")
                    else:
                        text_chunks.append(f"{field}: {str(val)}")
            
            # Fallback metadata additions if text slots are bare
            text_chunks.append(f"username: {username}")
            text_chunks.append(f"full_name: {profile.get('full_name', '')}")
            
            raw_text_payload = " | ".join(text_chunks).strip()
            
            print(f"--- SYNC ENGINE DEBUG: Processing user '{username}' (Length: {len(raw_text_payload)} chars) ---")
            
            # 3. Request high-dimensional vector coordinates from OpenAI
            if len(raw_text_payload) > 5:
                embedding_response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=[raw_text_payload[:7000]]
                )
                generated_embedding = embedding_response.data[0].embedding
                
                # 4. Inject vector directly back into Supabase targeting this precise profile item
                supabase.table("profiles").update({
                    "profile_embedding": generated_embedding
                }).eq("id", user_id).execute()
                
                updated_count += 1
                print(f"--- SYNC ENGINE SUCCESS: Written embedding coordinate matrix for {username} ---")
                
        return {
            "success": True, 
            "message": f"Successfully vectorized existing candidate pool. Updated {updated_count} rows."
        }
        
    except Exception as error:
        print(f"--- CRITICAL SYNC EXCEPTION LOG: {str(error)} ---")
        raise HTTPException(status_code=500, detail=str(error))
