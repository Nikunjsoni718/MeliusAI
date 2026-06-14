import os
import base64
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from dotenv import load_dotenv

try:
    from supabase import create_client
except ImportError:
    create_client = None

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

# Enable Cross-Origin Resource Sharing (CORS) for Next.js frontend port loop
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://melius-ai.vercel.app", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI Client (Guaranteed to read from root .env.local now)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
supabase_backend_client = None


def get_supabase_backend_client():
    global supabase_backend_client

    if create_client is None:
        raise HTTPException(
            status_code=500,
            detail="The supabase-py package is not installed in the Python backend environment.",
        )

    if supabase_backend_client is None:
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = (
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or os.getenv("SUPABASE_ANON_KEY")
            or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        )

        if not supabase_url or not supabase_key:
            raise HTTPException(
                status_code=500,
                detail="Supabase URL/key environment variables are not configured for member search.",
            )

        supabase_backend_client = create_client(supabase_url, supabase_key)

    return supabase_backend_client


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


# --- EXPERT REVIEWS ENDPOINT ---
@app.post("/api/review")
async def review_portfolio_asset(file: UploadFile):
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    temp_file_path = upload_dir / file.filename
    temporary_processing_paths = []
    code_extensions = [
        ".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".json",
        ".cpp", ".c", ".h", ".cs", ".java", ".go", ".rs", ".php",
        ".rb", ".swift", ".kt", ".sql", ".sh", ".yaml", ".yml", ".md"
    ]

    try:
        # Stream raw incoming file bytes down to local server disk storage
        with open(temp_file_path, "wb") as buffer:
            buffer.write(await file.read())

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
from pydantic import BaseModel
from typing import Any, Dict, List


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
async def sync_single_profile_embedding(request: Request):
    data = await request.json()

    try:
        profile_id = data.get("id") or data.get("profile_id")
        if not profile_id:
            return {"success": False, "message": "Profile vector sync skipped: missing profile id."}

        supabase = get_supabase_backend_client()
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
        new_embedding = fetch_openai_embeddings([profile_text])[0]
        supabase.table("profiles").update({"profile_embedding": new_embedding}).eq("id", profile_id).execute()
        print("--- ML SUCCESS: Automatically synchronized profile vector embeddings in background thread ---")

        return {"success": True, "message": "Profile vector embedding synchronized."}
    except Exception as embedding_sync_error:
        print(f"--- ML ERROR: Profile saved, but auto-vector generation failed: {embedding_sync_error} ---")
        return {"success": False, "message": "Profile saved, but vector synchronization failed."}


@app.post("/api/search-member")
async def verify_member(request: Request):
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

    supabase = get_supabase_backend_client()
    result = supabase.table("profiles").select("*").ilike("username", target_username).execute()

    if not result.data:
        return {"success": False, "message": f"No user found with username '{target_username}'"}

    return {"success": True, "user": result.data[0]}


@app.post("/api/match-talent")
async def match_talent(request: Request):
    try:
        data = await request.json()
        prompt = str(data.get("prompt", "") if isinstance(data, dict) else "").strip()
        organization_id = data.get("organization_id") if isinstance(data, dict) else None
        raw_min_score = data.get("min_score", 0) if isinstance(data, dict) else 0

        try:
            min_score = float(raw_min_score or 0)
        except (TypeError, ValueError):
            min_score = 0.0

        if not prompt:
            raise HTTPException(status_code=400, detail="Please add new information to bring clarity.")

        supabase = get_supabase_backend_client()
        organization = None
        feedback_rows = []

        if organization_id:
            try:
                organization_result = (
                    supabase.table("organizations")
                    .select("*")
                    .eq("id", organization_id)
                    .limit(1)
                    .execute()
                )
                organization = (organization_result.data or [None])[0]
            except Exception as organization_error:
                print(f"--- TALENT MATCH ORG CONTEXT WARNING: {str(organization_error)} ---")

            try:
                feedback_result = (
                    supabase.table("matching_feedback")
                    .select("*")
                    .eq("organization_id", organization_id)
                    .order("created_at", desc=True)
                    .limit(150)
                    .execute()
                )
                feedback_rows = feedback_result.data or []
            except Exception as feedback_error:
                print(f"--- TALENT MATCH FEEDBACK WARNING: {str(feedback_error)} ---")

        organization_context = build_organization_context(organization)

        intent_completion = client.chat.completions.create(
            model="gpt-4o",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are MeliusAI's hiring intent parser. Return strict JSON only with these keys: "
                        "experience_requirement, required_skills, excluded_skills, semantic_expansion. "
                        "experience_requirement must be one of fresher, experienced, any. "
                        "required_skills and excluded_skills must be arrays of concise technology/domain terms. "
                        "semantic_expansion must be a professional vector-search rewrite of the operator request."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Parse this talent search request into strict matching intent JSON:\n\n"
                        f"{prompt}"
                    ),
                },
            ],
            temperature=0.1,
        )
        intent_content = intent_completion.choices[0].message.content or "{}"

        try:
            parsed_intent = json.loads(intent_content)
        except json.JSONDecodeError:
            print(f"--- TALENT MATCH INTENT PARSE WARNING: Invalid JSON returned: {intent_content} ---")
            parsed_intent = {}

        experience_requirement = str(parsed_intent.get("experience_requirement", "any")).strip().lower()
        if experience_requirement not in ["fresher", "experienced", "any"]:
            experience_requirement = "any"

        required_skills = [
            str(skill).strip().lower()
            for skill in parsed_intent.get("required_skills", [])
            if str(skill).strip()
        ]
        excluded_skills = [
            str(skill).strip().lower()
            for skill in parsed_intent.get("excluded_skills", [])
            if str(skill).strip()
        ]
        semantic_expansion = str(parsed_intent.get("semantic_expansion", "")).strip() or prompt

        profiles_result = supabase.table("profiles").select("*").execute()
        profiles = profiles_result.data or []
        profile_ids = [profile.get("id") for profile in profiles if profile.get("id")]
        projects_by_profile_id = {profile_id: [] for profile_id in profile_ids}
        seen_project_ids = set()

        if profile_ids:
            for owner_column in ["user_id", "owner_id", "profile_id"]:
                try:
                    projects_result = (
                        supabase.table("projects")
                        .select("*")
                        .in_(owner_column, profile_ids)
                        .execute()
                    )

                    for project in projects_result.data or []:
                        owner_id = project.get(owner_column)
                        project_key = project.get("id") or f"{owner_column}:{owner_id}:{len(seen_project_ids)}"
                        if not owner_id or owner_id not in projects_by_profile_id or project_key in seen_project_ids:
                            continue

                        seen_project_ids.add(project_key)
                        projects_by_profile_id[owner_id].append(project)
                except Exception as project_lookup_error:
                    print(
                        f"--- TALENT MATCH PROJECT JOIN WARNING: Unable to fetch projects by {owner_column}: "
                        f"{str(project_lookup_error)} ---"
                    )

        positive_feedback_candidate_ids = {
            row.get("candidate_id")
            for row in feedback_rows
            if str(row.get("action", "")).lower() in ["clicked", "shortlisted"]
        }

        hiring_intent = (
            "MeliusAI semantic hiring intent vector.\n"
            "Organization industry/domain/workspace context:\n"
            f"{organization_context or 'No explicit organization context available.'}\n\n"
            "LLM-parsed operator semantic expansion:\n"
            f"{semantic_expansion}\n\n"
            "Original operator request:\n"
            f"{prompt}\n\n"
            "Match implicit capability adjacency, equivalent technologies, architectural domain overlap, seniority, "
            "portfolio relevance, and skill-transfer patterns."
        )
        query_embedding = fetch_openai_embeddings([hiring_intent])[0]
        fresher_exclusion_pattern = re.compile(
            r"\b(?:senior|lead|mid[-\s]?level|principal|manager|architect)\b|"
            r"\b(?:[4-9]|[1-9][0-9])\+?\s*(?:yrs?|years?)\b",
            re.IGNORECASE,
        )
        candidates = []
        for profile_row in profiles:
            candidate_id = profile_row.get("id")
            if not candidate_id:
                continue

            candidate_projects = projects_by_profile_id.get(candidate_id, [])
            profile_corpus = " ".join(
                stringify_profile_value(profile_row.get(field))
                for field in [
                    "bio",
                    "biotext",
                    "about",
                    "description",
                    "headline",
                    "professional_headline",
                    "role",
                    "target_role",
                    "title",
                    "experience",
                    "hobbies",
                    "skills",
                    "tags",
                    "tech_stack",
                    "specialties",
                ]
            ).lower()
            project_corpus = " ".join(build_project_search_text(project) for project in candidate_projects).lower()
            combined_corpus = f"{profile_corpus} {project_corpus}".strip()

            if experience_requirement == "fresher" and fresher_exclusion_pattern.search(profile_corpus):
                print(
                    f"--- TALENT MATCH ANALYTICAL FILTER: Dropping experienced candidate "
                    f"'{profile_row.get('username')}' from fresher search. ---"
                )
                continue

            if required_skills:
                missing_required_skills = [
                    skill for skill in required_skills if skill not in profile_corpus
                ]
                if missing_required_skills:
                    print(
                        f"--- TALENT MATCH ANALYTICAL FILTER: Dropping candidate '{profile_row.get('username')}' "
                        f"because profile attributes lack required skill(s): {missing_required_skills} ---"
                    )
                    continue

            if excluded_skills and any(skill in combined_corpus for skill in excluded_skills):
                print(
                    f"--- TALENT MATCH ANALYTICAL FILTER: Dropping candidate '{profile_row.get('username')}' "
                    f"because excluded skill was detected. ---"
                )
                continue

            if required_skills:
                missing_profile_and_project_skills = [
                    skill
                    for skill in required_skills
                    if skill not in profile_corpus and skill not in project_corpus
                ]
                if missing_profile_and_project_skills:
                    print(
                        f"--- TALENT MATCH STRICT FILTER: Dropping candidate '{profile_row.get('username')}' "
                        f"because profile/projects lack required skill(s): {missing_profile_and_project_skills} ---"
                    )
                    continue

            candidate_projects = projects_by_profile_id.get(candidate_id, [])
            project_scores = [
                score
                for score in (extract_project_assessment_score(project) for project in candidate_projects)
                if score is not None
            ]
            avg_project_score = (
                round(sum(project_scores) / len(project_scores), 2)
                if project_scores
                else float(profile_row.get("avg_project_score") or 0)
            )

            try:
                supabase.table("profiles").update({"avg_project_score": avg_project_score}).eq("id", candidate_id).execute()
            except Exception as average_sync_error:
                print(
                    f"--- TALENT MATCH AVG SCORE WARNING: Unable to persist avg_project_score for "
                    f"{candidate_id}: {str(average_sync_error)} ---"
                )

            profile_embedding = profile_row.get("profile_embedding")
            if not isinstance(profile_embedding, list) or not profile_embedding:
                candidate_text = f"{build_profile_embedding_text(profile_row)} {project_corpus}".strip()
                if not candidate_text:
                    continue

                try:
                    profile_embedding = fetch_openai_embeddings([candidate_text])[0]
                    supabase.table("profiles").update({"profile_embedding": profile_embedding}).eq("id", candidate_id).execute()
                except Exception as embedding_error:
                    print(
                        f"--- TALENT MATCH EMBEDDING WARNING: Unable to create embedding for "
                        f"{candidate_id}: {str(embedding_error)} ---"
                    )
                    continue

            try:
                similarity = cosine_similarity(
                    [float(value) for value in query_embedding],
                    [float(value) for value in profile_embedding],
                )
            except (TypeError, ValueError):
                similarity = 0.0
            
            # Calculate learning loop bonuses
            feedback_multiplier = 1.10 if candidate_id in positive_feedback_candidate_ids else 1.0
            weighted_similarity = min(0.99, max(0.0, similarity * feedback_multiplier))
            vector_match_index = max(0, min(99, round(weighted_similarity * 100)))
            project_keyword_hits = [
                keyword
                for keyword in required_skills
                if keyword in project_corpus
            ]
            project_keyword_score = (
                100
                if required_skills and len(project_keyword_hits) == len(required_skills)
                else 65
                if project_keyword_hits
                else 100
                if not required_skills
                else 0
            )
            average_score_component = max(0, min(100, avg_project_score))
            match_index = (
                round(vector_match_index * 0.55 + project_keyword_score * 0.25 + average_score_component * 0.20)
                if required_skills
                else round(vector_match_index * 0.75 + average_score_component * 0.25)
            )
            match_index = max(0, min(99, match_index))

            if match_index < 60 or (min_score and avg_project_score < min_score):
                continue

            profile_role = (
                profile_row.get("headline")
                or profile_row.get("professional_headline")
                or profile_row.get("bio")
                or "Verified MeliusAI Talent"
            )
            
            # Compile display tags containing our new live dynamic score metric row values
            tags = [f"Vector Match: {vector_match_index}%"]
            tags.append(f"Project Keyword Match: {project_keyword_score}%")
            tags.append(f"Avg Score: {avg_project_score}/100")
            if feedback_multiplier > 1:
                tags.append("Feedback Boost: +10%")

            candidates.append({
                "id": candidate_id,
                "full_name": profile_row.get("full_name") or profile_row.get("username") or "MeliusAI Talent",
                "username": profile_row.get("username") or "",
                "role": str(profile_role)[:140],
                "match_index": match_index,
                "tags": tags[:5],
            })

        sorted_candidates = sorted(candidates, key=lambda c: c["match_index"], reverse=True)[:5]
        return {"success": True, "candidates": sorted_candidates}

    except Exception as error:
        print(f"--- TALENT MATCH ERROR: {str(error)} ---")
        return {"success": False, "message": "Failed to compute talent match index criteria profile schemas."}

@app.post("/api/match-feedback")
async def match_feedback(request: Request):
    try:
        data = await request.json()
        organization_id = data.get("organization_id") if isinstance(data, dict) else None
        candidate_id = data.get("candidate_id") if isinstance(data, dict) else None
        search_prompt = str(data.get("search_prompt", "") if isinstance(data, dict) else "").strip()
        action = str(data.get("action", "") if isinstance(data, dict) else "").strip().lower()

        if not organization_id or not candidate_id or not search_prompt or action not in ["clicked", "shortlisted", "skipped"]:
            return {"success": False, "message": "Invalid matching feedback payload."}

        supabase = get_supabase_backend_client()
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
async def organization_invitations(request: Request):
    organization_id = request.query_params.get("organization_id")

    if not organization_id:
        return {"success": False, "message": "organization_id is required.", "invitations": []}

    supabase = get_supabase_backend_client()
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
async def cancel_invitation(request: Request):
    data = await request.json()
    invitation_id = data.get("id")

    if not invitation_id:
        return {"success": False, "message": "Invitation id is required."}

    supabase = get_supabase_backend_client()
    supabase.table("organization_invitations").update({"status": "cancelled"}).eq("id", invitation_id).execute()

    return {"success": True, "message": "Invitation cancelled successfully."}


class ChatHistoryRequest(BaseModel):
    messages: List[Dict[str, str]]


@app.post("/api/chat")
async def interactive_chat_station(request: ChatHistoryRequest):
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
async def sync_database_embeddings():
    try:
        supabase = get_supabase_backend_client()
        
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
