import os
import asyncio
import base64
import io
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
import httpx
import pypdf
from pptx import Presentation
from fastapi import BackgroundTasks, Depends, FastAPI, UploadFile, HTTPException, Request, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openai import AsyncOpenAI, OpenAI
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError, model_validator
from typing import Any, Dict, List

try:
    from supabase import Client, ClientOptions, create_client
except ImportError:
    Client = Any
    create_client = None
    ClientOptions = None

# --- MULTIMODAL PARSER EXTENSIONS ---
import fitz  # PyMuPDF
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
production_origins = [
    "https://meliusai.in",
    "https://www.meliusai.in",
]
local_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
extra_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
origins = list(dict.fromkeys(production_origins + local_origins + extra_origins))

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
logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
client = AsyncOpenAI()
async_client = client
openai_client = async_client
sync_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
logger = logging.getLogger("meliusai.backend")
logger.setLevel(logging.INFO)
supabase_backend_client = None
supabase_service_client = None
supabase: Client | None = None
bearer_scheme = HTTPBearer(auto_error=False)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
AUDIT_FILE_CONTENT_CHAR_LIMIT = 18000
AUDIT_REDUCE_REPORT_CHAR_LIMIT = 28000
AUTHORIZED_REVIEWER_ROLES = {"admin", "reviewer", "recruiter", "corporate", "organization"}

BIO_EXTRACTION_SYSTEM_PROMPT = (
    "You are an expert technical recruiter. Analyze the following candidate biography. "
    "Extract specific technical experiences (years, tools, roles) and work preferences "
    "(remote, hybrid, startup, enterprise, etc.). Return ONLY a valid JSON object with two "
    "keys: 'experience' (a list of strings) and 'preferences' (a list of strings). Do not "
    "return markdown, just raw JSON."
)

PROFILE_PROCESSING_SYSTEM_PROMPT = (
    "You are a strict Data Parser and Evaluator for a talent platform. Your job is to extract objective reality from candidate bios.\n"
    "All extracted string arrays must be normalized to lowercase without special characters to ensure perfect string-matching with database tags.\n"
    "RULE 1 (LATERAL MAPPING ALLOWED): You may translate explicit job titles into their universally accepted, baseline skills. For example, if they state 'UI/UX Designer', you may extract 'Frontend Design', 'Wireframing', or 'Figma'. \n"
    "RULE 2 (ZERO INFLATION OR FLATTERY): You may NEVER invent vertical experience. Do not add advanced skills, leadership qualities, or unrelated tech stacks they haven't explicitly proven. No buttering up the candidate.\n"
    "RULE 3: If experience or preferences are not explicitly written, return [].\n"
    "RULE 4 (STRICT LIMITS): Max 5 skills, Max 4 internal_keywords, Max 2 experience points, Max 3 preferences. Extract reality, logically mapped."
)


class ProfileExtraction(BaseModel):
    skills: list[str] = Field(description="Standardized hard skills. Infer highly relevant, closely coupled skills (e.g., 'UI/UX' -> 'Frontend Design', 'Backend' -> 'Python' or 'SQL'). Do NOT flatter the candidate by inventing loosely related skills. MAXIMUM 5 ITEMS. 1-2 words each. FORMATTING RULE: Must be entirely lowercase. Do not use slashes or special characters (e.g., convert 'UI/UX' to 'ui ux design', 'C++' to 'cpp'). Standardize to match common lowercase job board tags.")
    internal_keywords: list[str] = Field(description="Broad industry terms and categorizations based on their bio (e.g., 'Web Development', 'Engineering'). Stay grounded in reality. MAXIMUM 4 ITEMS. FORMATTING RULE: Must be entirely lowercase. Do not use slashes or special characters (e.g., convert 'UI/UX' to 'ui ux design', 'C++' to 'cpp'). Standardize to match common lowercase job board tags.")
    extracted_experience: list[str] = Field(description="STRICTLY EXTRACT. Only list experience explicitly stated in the text. DO NOT invent duties or responsibilities. Max 2 items.")
    extracted_preferences: list[str] = Field(description="STRICTLY EXTRACT explicitly stated preferences (e.g., 'looking for remote'). DO NOT invent cultural preferences. Max 3 items.")

SEARCH_QUERY_SYSTEM_PROMPT = (
    "You are a talent search engine. The user will type a natural language search query. "
    "Extract their intent into a JSON object with three arrays: 'target_skills' "
    "(e.g. ['ui', 'ux', 'designer']), 'target_experience' (convert words to numbers, "
    "e.g. ['4 years']), and 'target_preferences', plus 'target_name': str | null. "
    "If the query contains a specific person's name or username, extract it into "
    "'target_name'. Otherwise, leave it null. Return ONLY valid JSON."
)


def normalize_profile_processing_list(value: Any, *, lowercase: bool = True) -> List[str]:
    values = value if isinstance(value, list) else [value]
    normalized_values = []

    for item in values:
        if isinstance(item, dict):
            raw_item = " ".join(str(part) for part in item.values() if part)
        else:
            raw_item = str(item or "")

        normalized_item = raw_item.strip()
        if lowercase:
            normalized_item = normalized_item.lower()
        if normalized_item and normalized_item not in normalized_values:
            normalized_values.append(normalized_item)

    return normalized_values


def normalize_profile_processing_text(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())

    if isinstance(value, dict):
        return ", ".join(str(item).strip() for item in value.values() if str(item).strip())

    return str(value or "").strip()


async def extract_profile_processing_fields(bio_text: str) -> ProfileExtraction:
    clean_bio = str(bio_text or "").strip()

    if not clean_bio:
        return ProfileExtraction(
            skills=[],
            internal_keywords=[],
            extracted_experience=[],
            extracted_preferences=[],
        )

    completion = await client.beta.chat.completions.parse(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": PROFILE_PROCESSING_SYSTEM_PROMPT},
            {"role": "user", "content": clean_bio},
        ],
        response_format=ProfileExtraction,
        temperature=0,
    )
    extracted_data = completion.choices[0].message.parsed

    if extracted_data is None:
        raise ValueError("OpenAI profile extraction returned no parsed structured output")

    skills = normalize_profile_processing_list(extracted_data.skills)
    internal_keywords = normalize_profile_processing_list(extracted_data.internal_keywords)
    extracted_experience = normalize_profile_processing_list(
        extracted_data.extracted_experience,
        lowercase=False,
    )
    extracted_preferences = normalize_profile_processing_list(
        extracted_data.extracted_preferences,
        lowercase=False,
    )

    if not skills and internal_keywords:
        skills = internal_keywords[:12]

    if not internal_keywords and skills:
        internal_keywords = skills

    return ProfileExtraction(
        skills=skills,
        internal_keywords=internal_keywords,
        extracted_experience=extracted_experience,
        extracted_preferences=extracted_preferences,
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
    global supabase, supabase_backend_client

    if create_client is None:
        raise HTTPException(
            status_code=500,
            detail="The supabase-py package is not installed in the Python backend environment.",
        )

    if supabase_backend_client is None:
        supabase_url, supabase_key = get_supabase_public_config()
        supabase_backend_client = create_client(supabase_url, supabase_key)
        supabase = supabase_backend_client

    return supabase_backend_client


def get_supabase_service_client():
    global supabase_service_client

    if create_client is None:
        raise HTTPException(
            status_code=500,
            detail="The supabase-py package is not installed in the Python backend environment.",
        )

    service_role_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE")
    )

    if not service_role_key:
        return None

    if supabase_service_client is None:
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        if not supabase_url:
            raise HTTPException(
                status_code=500,
                detail="Supabase URL environment variable is not configured.",
            )
        supabase_service_client = create_client(supabase_url, service_role_key)

    return supabase_service_client


def get_supabase_read_client(request: Request | None = None):
    service_client = get_supabase_service_client()
    if service_client is not None:
        return service_client

    authenticated_client = getattr(request.state, "supabase", None) if request is not None else None
    if authenticated_client is not None:
        return authenticated_client

    logger.warning(
        "SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to anon Supabase client. "
        "Ensure RLS policies allow public reads for profiles/projects/opportunities used by read endpoints."
    )
    return get_supabase_backend_client()


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


def get_request_access_token(request: Request) -> str:
    state_token = getattr(request.state, "access_token", None)
    if isinstance(state_token, str) and state_token.strip():
        return state_token.strip()

    authorization = request.headers.get("authorization", "")
    scheme, _, credentials = authorization.partition(" ")
    if scheme.lower() != "bearer" or not credentials.strip():
        raise HTTPException(status_code=401, detail="Missing bearer token")

    return credentials.strip()


def decode_supabase_jwt_sub(access_token: str) -> str:
    try:
        parts = access_token.split(".")
        if len(parts) < 2:
            raise ValueError("Malformed JWT")

        payload_segment = parts[1]
        padded_payload = payload_segment + "=" * (-len(payload_segment) % 4)
        decoded_payload = base64.urlsafe_b64decode(padded_payload.encode("utf-8"))
        payload = json.loads(decoded_payload.decode("utf-8"))
        subject = str(payload.get("sub") or "").strip()
    except Exception as decode_error:
        raise HTTPException(status_code=401, detail="Invalid bearer token") from decode_error

    if not subject:
        raise HTTPException(status_code=401, detail="Invalid bearer token")

    return subject


def get_request_supabase_client(request: Request):
    authenticated_client = getattr(request.state, "supabase", None)

    if authenticated_client is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return authenticated_client


def get_request_scoped_supabase_client(request: Request):
    authenticated_client = getattr(request.state, "supabase", None)
    if authenticated_client is not None:
        return authenticated_client

    return get_supabase_authenticated_client(get_request_access_token(request))


def is_supabase_rls_error(error: Exception) -> bool:
    error_text = str(error).lower()
    return "42501" in error_text or "row-level security" in error_text


SPECTATE_PROFILE_PUBLIC_SELECT = (
    "id, username, full_name, bio, avatar_url, age, current_status, "
    "qualifications, experience, hobbies, skills"
)
SPECTATE_PROJECT_PUBLIC_SELECT = "*"


def normalize_email(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()

    return None


def get_supabase_auth_user_email(user_response: Any) -> str | None:
    auth_user = getattr(user_response, "user", None)
    if auth_user is None:
        auth_user = getattr(user_response, "data", None)
    if auth_user is None:
        auth_user = user_response

    if isinstance(auth_user, dict):
        return normalize_email(auth_user.get("email"))

    return normalize_email(getattr(auth_user, "email", None))


async def fetch_auth_email_for_profile(admin_supabase: Any, profile_id: str) -> str | None:
    try:
        user_response = await asyncio.to_thread(
            lambda: admin_supabase.auth.admin.get_user_by_id(profile_id)
        )
    except Exception as auth_email_error:
        logger.warning("Unable to resolve profile email from Supabase auth admin: %s", auth_email_error)
        return None

    return get_supabase_auth_user_email(user_response)


def dedupe_rows_by_id(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped_rows: Dict[str, Dict[str, Any]] = {}
    fallback_rows: List[Dict[str, Any]] = []

    for row in rows:
        row_id = str(row.get("id") or "").strip()
        if row_id:
            deduped_rows[row_id] = row
        else:
            fallback_rows.append(row)

    return list(deduped_rows.values()) + fallback_rows


async def fetch_project_rows_for_profile(supabase: Any, profile_id: str) -> List[Dict[str, Any]]:
    try:
        projects_response = await asyncio.to_thread(
            lambda: supabase.table("projects")
            .select(SPECTATE_PROJECT_PUBLIC_SELECT)
            .eq("user_id", profile_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as projects_error:
        logger.warning(
            "Unable to hydrate spectator profile projects via user_id: %s",
            projects_error,
        )
        return []

    project_rows = projects_response.data if isinstance(projects_response.data, list) else []

    return sorted(
        dedupe_rows_by_id(project_rows),
        key=lambda row: str(row.get("created_at") or ""),
        reverse=True,
    )


def get_project_score(project: Dict[str, Any]) -> int | float | None:
    for field_name in ("logic_score", "evaluation_score", "score"):
        value = project.get(field_name)
        if isinstance(value, (int, float)):
            return value

    return None


def build_project_scan_rows(project_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    scan_rows: List[Dict[str, Any]] = []

    for project in project_rows:
        project_id = str(project.get("id") or "").strip()
        if not project_id:
            continue

        score = get_project_score(project)
        if score is None:
            continue

        title = (
            project.get("name")
            or project.get("title")
            or project.get("file_name")
            or "Portfolio asset"
        )
        summary = (
            project.get("audit_summary")
            or project.get("ai_summary")
            or project.get("summary")
            or project.get("description")
        )

        scan_rows.append(
            {
                "id": f"project-scan-{project_id}",
                "project_id": project_id,
                "title": title,
                "score": score,
                "evaluation_score": score,
                "logic_score": score,
                "summary": summary,
                "ai_summary": project.get("ai_summary") or summary,
                "description": project.get("description") or summary,
                "created_at": project.get("updated_at") or project.get("created_at"),
            }
        )

    return scan_rows


def apply_opportunity_organization_scope(query: Any, organization_id: str, current_user_id: str):
    scoped_ids = []
    for value in (organization_id, current_user_id):
        normalized_value = str(value or "").strip()
        if normalized_value and normalized_value not in scoped_ids:
            scoped_ids.append(normalized_value)

    if len(scoped_ids) == 1:
        return query.eq("organization_id", scoped_ids[0])

    return query.or_(",".join(f"organization_id.eq.{scoped_id}" for scoped_id in scoped_ids))


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


async def resolve_request_user(
    request: Request,
    token: HTTPAuthorizationCredentials | None,
    *,
    required: bool,
) -> tuple[str | None, str]:
    if token is None or token.scheme.lower() != "bearer" or not token.credentials:
        if required:
            raise HTTPException(status_code=401, detail="Missing bearer token")
        return None, "anonymous"

    supabase_client = get_supabase_backend_client()

    try:
        user_response = await asyncio.to_thread(
            lambda: supabase_client.auth.get_user(token.credentials)
        )
    except Exception as auth_error:
        logger.warning("Supabase JWT verification failed: %s", auth_error)
        if required:
            raise HTTPException(status_code=401, detail="Invalid bearer token") from auth_error
        return None, "invalid"

    user_id = get_supabase_user_id(user_response)
    if not user_id:
        if required:
            raise HTTPException(status_code=401, detail="Invalid bearer token")
        return None, "invalid"

    request.state.user_id = user_id
    request.state.access_token = token.credentials
    request.state.user_roles = get_supabase_user_roles(user_response)
    request.state.supabase = get_supabase_authenticated_client(token.credentials)

    return user_id, "authenticated"


async def verify_user(
    request: Request,
    token: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    user_id, _ = await resolve_request_user(request, token, required=True)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid bearer token")

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


EVALUATION_LANGUAGE_MAP = {
    ".c": "C",
    ".cc": "C++",
    ".cpp": "C++",
    ".cs": "C#",
    ".css": "CSS",
    ".cxx": "C++",
    ".dart": "Dart",
    ".go": "Go",
    ".h": "C/C++ Header",
    ".hpp": "C++ Header",
    ".html": "HTML",
    ".java": "Java",
    ".jsx": "JavaScript React (JSX)",
    ".js": "JavaScript",
    ".json": "JSON",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".lua": "Lua",
    ".md": "Markdown",
    ".mjs": "JavaScript",
    ".php": "PHP",
    ".py": "Python",
    ".rb": "Ruby",
    ".rs": "Rust",
    ".scala": "Scala",
    ".scss": "SCSS",
    ".sh": "Shell",
    ".sql": "SQL",
    ".svelte": "Svelte",
    ".swift": "Swift",
    ".toml": "TOML",
    ".ts": "TypeScript",
    ".tsx": "TypeScript React (TSX)",
    ".vue": "Vue",
    ".xml": "XML",
    ".yaml": "YAML",
    ".yml": "YAML",
}

EVALUATION_SYSTEM_MESSAGE = (
    "You are an elite Senior Staff Software Engineer auditing code for MeliusAI. "
    "Evaluate the code for architectural design, performance, security, and best practices. "
    "You MUST generate a detailed, non-empty 'description' for every submitted file, regardless "
    "of programming language. The description must explain the code's apparent purpose, runtime "
    "role, architectural structure, major components/functions/classes, data flow, and integration "
    "points. Modern web files such as .ts and .tsx require the exact same deep architectural "
    "description as backend languages like Java, Python, or Go; never treat TypeScript, TSX, JSX, "
    "or frontend component files as lightweight snippets. "
    "Return ONLY a valid JSON object with this exact schema and no markdown: "
    "{'description': string, 'score': number, 'grade': 'A'|'B'|'C'|'D'|'F', "
    "'pros': [string, string, string], 'cons': [string, string, string], "
    "'recommendations': [string, string, string]}. "
    "The 'description' key is mandatory, must be a string, and must never be null, empty, "
    "or a generic placeholder."
)

EVALUATION_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "melius_code_evaluation",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "description": {
                    "type": "string",
                    "description": (
                        "Detailed architectural and purpose description of the submitted code. "
                        "Mandatory for every language, including TypeScript, TSX, JavaScript, and JSX."
                    ),
                },
                "score": {"type": "number"},
                "grade": {"type": "string", "enum": ["A", "B", "C", "D", "F"]},
                "pros": {"type": "array", "items": {"type": "string"}},
                "cons": {"type": "array", "items": {"type": "string"}},
                "recommendations": {"type": "array", "items": {"type": "string"}},
            },
            "required": [
                "description",
                "score",
                "grade",
                "pros",
                "cons",
                "recommendations",
            ],
        },
    },
}


class EvaluationRequest(BaseModel):
    fileUrl: str
    filename: str
    projectId: str | None = None
    project_id: str | None = None
    fileId: str | None = None
    file_id: str | None = None


@app.post("/api/evaluate")
async def evaluate_code(
    request: Request,
    payload: EvaluationRequest,
    current_user_id: str = Depends(verify_user),
):
    file_url = payload.fileUrl.strip()
    filename = secure_filename(payload.filename)
    project_id = (
        payload.projectId
        or payload.project_id
        or payload.fileId
        or payload.file_id
        or ""
    ).strip()
    _, ext = os.path.splitext(filename.lower())
    detected_language = EVALUATION_LANGUAGE_MAP.get(ext, "Unknown/Generic Text")

    if not file_url:
        raise HTTPException(
            status_code=400,
            detail="fileUrl is required.",
        )

    if not project_id:
        raise HTTPException(
            status_code=400,
            detail="projectId is required so evaluation metrics can be persisted.",
        )

    logger.info(
        "code_evaluation.start user_id=%s project_id=%s filename=%s language=%s",
        current_user_id,
        project_id,
        filename,
        detected_language,
    )

    try:
        logger.info("code_evaluation.download.start filename=%s", filename)
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(30.0, connect=10.0),
        ) as http_client:
            response = await http_client.get(file_url)

        logger.info(
            "code_evaluation.download.complete filename=%s status_code=%s byte_count=%s",
            filename,
            response.status_code,
            len(response.content),
        )
        response.raise_for_status()

        file_bytes = response.content
        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Downloaded files must be 5 MB or smaller.",
        )

        code_content = file_bytes.decode("utf-8", errors="replace")
        if len(code_content.strip()) == 0:
            logger.error("code_evaluation.empty_file filename=%s", filename)
            raise HTTPException(
                status_code=400,
                detail="This file is empty. Please delete it and re-upload a non-empty code file.",
            )

        logger.info(
            "code_evaluation.decode.complete filename=%s char_count=%s",
            filename,
            len(code_content),
        )

        logger.info("code_evaluation.openai.start filename=%s", filename)
        # --- NEW INJECTED SYSTEM PROMPT ---
        strict_system_prompt = f"""{EVALUATION_SYSTEM_MESSAGE}

CRITICAL FORMATTING RULES (ABSOLUTE REQUIREMENT):
1. For the 'pros', 'cons', and 'recommendations' arrays, you MUST use the exact format: 'Catchy Hook: Short explanation'.
2. MAXIMUM 15 WORDS TOTAL PER ITEM. NO ESSAYS. NO PARAGRAPHS.

BAD EXAMPLE (DO NOT DO THIS): 'The code effectively encapsulates data with private member variables and provides public methods...'
GOOD EXAMPLE (DO THIS): 'Strong Encapsulation: Class correctly hides data using private variables.'
"""
        completion = await async_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": strict_system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"File Name: {filename}\n"
                        f"Language: {detected_language}\n\n"
                        "Mandatory output reminder: include a detailed, non-empty JSON "
                        "'description' explaining this file's architecture and purpose. "
                        "If this is a TypeScript, TSX, JSX, or JavaScript web file, describe "
                        "its component/state/data-flow architecture with the same depth you "
                        "would use for a Java backend service.\n\n"
                        f"Raw Code:\n{code_content}"
                    ),
                },
            ],
            response_format=EVALUATION_RESPONSE_FORMAT,
            temperature=0,
        )
        logger.info("code_evaluation.openai.complete filename=%s", filename)

        raw_content = completion.choices[0].message.content or "{}"
        parsed_content = json.loads(raw_content)
        description = parsed_content.get("description")
        if not isinstance(description, str) or not description.strip():
            logger.error("code_evaluation.missing_description filename=%s", filename)
            raise HTTPException(
                status_code=502,
                detail="AI evaluation response was missing the required code description.",
            )

        try:
            score = int(round(float(parsed_content.get("score"))))
        except (TypeError, ValueError):
            logger.error("code_evaluation.invalid_score filename=%s project_id=%s", filename, project_id)
            raise HTTPException(
                status_code=502,
                detail="AI evaluation response was missing a valid numeric score.",
            )

        score = max(0, min(100, score))

        def normalize_text_array(value: Any) -> List[str]:
            if not isinstance(value, list):
                return []

            normalized_items: List[str] = []
            for item in value:
                if isinstance(item, str) and item.strip():
                    normalized_items.append(item.strip())

            return normalized_items

        update_payload = {
            "audit_summary": description.strip(),
            "ai_summary": description.strip(),
            "description": description.strip(),
            "pros": normalize_text_array(parsed_content.get("pros")),
            "cons": normalize_text_array(parsed_content.get("cons")),
            "recommendations": normalize_text_array(parsed_content.get("recommendations")),
            "evaluation_score": score,
            "logic_score": score,
            "has_been_audited": True,
            "status": "Verified",
        }

        logger.info("code_evaluation.database.update.start project_id=%s filename=%s", project_id, filename)
        supabase_client = get_request_supabase_client(request)
        
        # Execute the mutation to persist the data
        update_response = await asyncio.to_thread(
            lambda: supabase_client.table("projects").update(update_payload).eq("id", project_id).execute()
        )
        

        updated_project = update_response.data
        if not updated_project:
            logger.warning(
                "code_evaluation.database.update.empty project_id=%s user_id=%s",
                project_id,
                current_user_id,
            )
            raise HTTPException(
                status_code=404,
                detail="Project was not found or is not owned by the authenticated user.",
            )

        logger.info("code_evaluation.database.update.complete project_id=%s filename=%s", project_id, filename)
        logger.info("code_evaluation.success filename=%s project_id=%s", filename, project_id)
        return {
            **parsed_content,
            "score": score,
            "project": updated_project,
            "database": {
                "status": "updated",
                "project_id": project_id,
                "has_been_audited": True,
            },
        }
    except HTTPException:
        raise
    except httpx.HTTPStatusError as download_error:
        logger.warning(
            "code_evaluation.download.bad_status filename=%s status_code=%s",
            filename,
            download_error.response.status_code,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Unable to download file from fileUrl. HTTP {download_error.response.status_code}.",
        ) from download_error
    except httpx.RequestError as download_error:
        logger.warning(
            "code_evaluation.download.failed filename=%s error=%s",
            filename,
            download_error,
        )
        raise HTTPException(
            status_code=400,
            detail="Unable to download file from fileUrl.",
        ) from download_error
    except json.JSONDecodeError as parse_error:
        logger.exception("code_evaluation.openai.malformed_json filename=%s", filename)
        raise HTTPException(
            status_code=502,
            detail="The evaluation model returned malformed JSON.",
        ) from parse_error
    except Exception as error:
        logger.exception("code_evaluation.failed")
        raise HTTPException(status_code=500, detail=str(error)) from error


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
- SCORING PRECISION: Do NOT default to lazy round numbers (e.g., 40, 70, 80, 90). You must calculate a highly precise, granular score out of 100 (e.g., 34, 78, 93) based on a strict deduction system. Deduct exact points for every missing dependency, unclosed connection, or type safety violation.

OUTPUT FORMAT (Strict JSON matching the dashboard UI):
{{
  "executive_summary": "Deeply technical summary evaluating the architecture of this {detected_language} asset.",
  "goods_and_strengths": ["Line-level engineering praise 1", "Line-level engineering praise 2"],
  "bads_and_flaws": ["Line-level architectural or security flaw 1", "Line-level architectural or security flaw 2"],
  "strategic_recommendations": ["Actionable refactoring strategy 1", "Actionable refactoring strategy 2"],
  "overall_score": 87
}}
"""

        completion = await async_client.chat.completions.create(
            model="gpt-4o-mini",
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
                    transcript = sync_client.audio.transcriptions.create(model="whisper-1", file=audio_file)
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
                        chunk_transcript = sync_client.audio.transcriptions.create(model="whisper-1", file=chunk_file)

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
            chat_stream = sync_client.chat.completions.create(
                model="gpt-4o-mini",
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


AUDIT_SCORE_FIELD_DESCRIPTION = """An integer from 0 to 100 based on code quality, architecture, security, and maintainability.
95-100: Masterful. Highly optimized, secure, flawless edge-case handling, scalable architecture.
85-94: Production-Ready. Clean, follows best practices, but may have minor inefficiencies.
70-84: Standard/Functional. Good logic and works well, but may lack advanced error handling, have repetitive code, or need better state management.
50-69: Prototype Quality. Core logic works, but suffers from hardcoded values, messy execution, or performance bottlenecks.
30-49: Needs Major Rework. Barely functional, severe security flaws, or spaghetti code.
0-29: Broken. Syntax errors, non-functional, or completely unreadable."""

AUDIT_LIST_FIELD_DESCRIPTION = "CRITICAL FORMAT RULE: Must strictly follow the 'Catchy Hook: Short explanation' format. Maximum 15 words total per item. Do not write paragraphs. Example: 'Security Risk: Hardcoded API keys expose sensitive info.'"


class UniversalAuditReport(BaseModel):
    calculatedScore: int = Field(..., ge=0, le=100, description=AUDIT_SCORE_FIELD_DESCRIPTION)
    executiveSummary: str
    pros: List[str] = Field(..., description=AUDIT_LIST_FIELD_DESCRIPTION)
    cons: List[str] = Field(..., description=AUDIT_LIST_FIELD_DESCRIPTION)
    strategicRecommendations: List[str] = Field(..., description=AUDIT_LIST_FIELD_DESCRIPTION)


class VerifyRequest(BaseModel):
    code: str
    projectId: str | None = None
    assetName: str | None = None
    assetTextContent: str | None = None
    userContextDescription: str | None = None

    @model_validator(mode="before")
    @classmethod
    def hydrate_code_from_legacy_payload(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        normalized_data = dict(data)
        code_value = normalized_data.get("code")
        legacy_asset_content = normalized_data.get("assetTextContent")

        if (code_value is None or not str(code_value).strip()) and legacy_asset_content is not None:
            normalized_data["code"] = legacy_asset_content
        elif code_value is None:
            normalized_data["code"] = ""

        return normalized_data


class AuditRequest(BaseModel):
    folder_id: str
    user_id: str


class AuditResponse(BaseModel):
    ai_summary: str
    score: int = Field(..., ge=0, le=100, description=AUDIT_SCORE_FIELD_DESCRIPTION)
    strengths: List[str] = Field(..., description=AUDIT_LIST_FIELD_DESCRIPTION)
    weaknesses: List[str] = Field(..., description=AUDIT_LIST_FIELD_DESCRIPTION)
    recommendations: List[str] = Field(..., description=AUDIT_LIST_FIELD_DESCRIPTION)

    @model_validator(mode="before")
    @classmethod
    def hydrate_audit_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        normalized_data = dict(data)
        ai_summary = str(normalized_data.get("ai_summary") or "").strip()

        if not ai_summary:
            for legacy_key in ("user_description", "executiveSummary", "executive_summary", "summary", "description"):
                legacy_value = str(normalized_data.get(legacy_key) or "").strip()
                if legacy_value:
                    normalized_data["ai_summary"] = legacy_value
                    break

        if "strengths" not in normalized_data and "pros" in normalized_data:
            normalized_data["strengths"] = normalized_data.get("pros")
        if "weaknesses" not in normalized_data and "cons" in normalized_data:
            normalized_data["weaknesses"] = normalized_data.get("cons")

        return normalized_data


ALLOWED_DETECTED_TYPES = {
    "complete website/project",
    "single code file",
    "beginner practice code",
    "HTML/CSS/JS learning notes",
    "README/documentation",
    "config/package file",
    "resume/portfolio text",
    "general notes",
    "incomplete/broken file",
    "unknown file",
}


DETECTED_TYPE_ALIASES = {
    "html website/project": "complete website/project",
    "html learning notes/practice file": "HTML/CSS/JS learning notes",
    "documentation/readme": "README/documentation",
    "beginner code file": "beginner practice code",
    "actual software project": "complete website/project",
    "unknown": "unknown file",
}


LANGUAGE_BY_EXTENSION = {
    ".c": "C",
    ".cc": "C++",
    ".cpp": "C++",
    ".cs": "C#",
    ".css": "CSS",
    ".cxx": "C++",
    ".go": "Go",
    ".h": "C/C++ Header",
    ".hpp": "C++ Header",
    ".html": "HTML",
    ".htm": "HTML",
    ".java": "Java",
    ".js": "JavaScript",
    ".jsx": "JavaScript React (JSX)",
    ".json": "JSON",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".md": "Markdown",
    ".mdx": "MDX",
    ".mjs": "JavaScript",
    ".php": "PHP",
    ".py": "Python",
    ".rb": "Ruby",
    ".readme": "Markdown",
    ".rs": "Rust",
    ".scss": "SCSS",
    ".sh": "Shell",
    ".sql": "SQL",
    ".svelte": "Svelte",
    ".swift": "Swift",
    ".ts": "TypeScript",
    ".tsx": "TypeScript React (TSX)",
    ".txt": "Plain text",
    ".vue": "Vue",
    ".xml": "XML",
    ".yaml": "YAML",
    ".yml": "YAML",
}


REVIEW_MODE_BY_DETECTED_TYPE = {
    "complete website/project": "full project/website review",
    "single code file": "single-file code review",
    "beginner practice code": "beginner practice code review",
    "HTML/CSS/JS learning notes": "frontend learning-notes review",
    "README/documentation": "documentation review",
    "config/package file": "configuration/package review",
    "resume/portfolio text": "resume/portfolio content review",
    "general notes": "notes review",
    "incomplete/broken file": "broken or incomplete artifact review",
    "unknown file": "general artifact review",
}


CONFIG_FILE_NAMES = {
    ".env",
    ".env.example",
    ".env.local",
    ".gitignore",
    ".prettierrc",
    "components.json",
    "dockerfile",
    "eslint.config.js",
    "eslint.config.mjs",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "package-lock.json",
    "package.json",
    "pnpm-lock.yaml",
    "postcss.config.js",
    "postcss.config.mjs",
    "requirements.txt",
    "tailwind.config.js",
    "tailwind.config.ts",
    "tsconfig.json",
    "vite.config.js",
    "vite.config.ts",
    "yarn.lock",
}


CONFIG_EXTENSIONS = {".ini", ".lock", ".toml", ".yaml", ".yml"}
CODE_EXTENSIONS = {
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".css",
    ".cxx",
    ".go",
    ".h",
    ".hpp",
    ".html",
    ".htm",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".mjs",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".scss",
    ".sh",
    ".sql",
    ".svelte",
    ".swift",
    ".ts",
    ".tsx",
    ".vue",
}


def count_regex(pattern: str, value: str) -> int:
    return len(re.findall(pattern, value, flags=re.IGNORECASE | re.MULTILINE))


def detect_asset_language(asset_name: str, asset_text_content: str) -> str:
    asset_name_lower = asset_name.lower()
    _, extension = os.path.splitext(asset_name_lower)

    if asset_name_lower == "readme" or asset_name_lower.startswith("readme."):
        return "Markdown"

    if extension in LANGUAGE_BY_EXTENSION:
        return LANGUAGE_BY_EXTENSION[extension]

    stripped_content = asset_text_content.strip()
    lowered_content = stripped_content.lower()

    if re.search(r"<!doctype\s+html|<html[\s>]|<body[\s>]|<div[\s>]|<section[\s>]", lowered_content):
        return "HTML"
    if re.search(r"#include\s*<[^>]+>|using\s+namespace\s+std|std::|cout\s*<<|cin\s*>>|int\s+main\s*\(", stripped_content):
        return "C++" if re.search(r"std::|cout\s*<<|cin\s*>>|class\s+\w+", stripped_content) else "C"
    if re.search(r"\bpublic\s+class\s+\w+|\bSystem\.out\.println\b|\bstatic\s+void\s+main\s*\(", stripped_content):
        return "Java"
    if lowered_content.startswith("#") or count_regex(r"^\s{0,3}#{1,6}\s+\S+", stripped_content) >= 2:
        return "Markdown"
    if re.search(r"\b(import|export)\s+.+\b(from|function|const)\b|console\.log\(|useState\s*\(|type\s+\w+\s*=", stripped_content):
        return "JavaScript/TypeScript"
    if re.search(r"\bdef\s+\w+\(|\bimport\s+\w+|if\s+__name__\s*==", stripped_content):
        return "Python"
    if re.search(r"\bSELECT\b.+\bFROM\b|\bINSERT\s+INTO\b|\bCREATE\s+TABLE\b", stripped_content, flags=re.IGNORECASE | re.DOTALL):
        return "SQL"

    return "Unknown"


def classify_html_asset(asset_text_content: str) -> str:
    lowered_content = asset_text_content.lower()
    html_tag_names = re.findall(r"</?\s*([a-z][a-z0-9-]*)\b", lowered_content)
    unique_html_tags = set(html_tag_names)

    tutorial_signal_count = count_regex(
        r"\b(example|practice|notes?|tutorial|exercise|lesson|demo|try it|learn|"
        r"basic html|html basics|tag examples?|attributes?|comments?|forms?|tables?|"
        r"media tags?|semantic tags?|heading tags?|paragraph tags?)\b",
        lowered_content,
    )
    html_comment_count = count_regex(r"<!--", lowered_content)
    doctype_count = count_regex(r"<!doctype\s+html", lowered_content)
    html_root_count = count_regex(r"<html[\s>]", lowered_content)
    repeated_document_count = max(doctype_count, html_root_count)
    snippet_heading_count = count_regex(r"\b(example|practice|exercise|demo)\s*\d*", lowered_content)
    diverse_practice_tag_count = sum(
        1
        for tag_name in [
            "form",
            "input",
            "textarea",
            "button",
            "table",
            "tr",
            "td",
            "a",
            "img",
            "video",
            "audio",
            "iframe",
        ]
        if tag_name in unique_html_tags
    )

    website_structure_score = 0
    website_structure_score += 2 if doctype_count == 1 else 0
    website_structure_score += 2 if all(tag in unique_html_tags for tag in ["html", "head", "body"]) else 0
    website_structure_score += 1 if "title" in unique_html_tags else 0
    website_structure_score += 1 if {"header", "nav", "main", "footer"} & unique_html_tags else 0
    website_structure_score += 1 if re.search(r"<link\b[^>]+stylesheet|<script\b|<style\b", lowered_content) else 0

    learning_notes_score = 0
    learning_notes_score += min(tutorial_signal_count, 6)
    learning_notes_score += min(html_comment_count, 4)
    learning_notes_score += min(snippet_heading_count, 4)
    learning_notes_score += 3 if repeated_document_count > 1 else 0
    learning_notes_score += 2 if len(unique_html_tags) >= 18 else 0
    learning_notes_score += 2 if diverse_practice_tag_count >= 5 else 0

    if "<html" in lowered_content and "</html>" not in lowered_content and learning_notes_score < 4:
        return "incomplete/broken file"

    if (
        website_structure_score >= 6
        and repeated_document_count == 1
        and {"header", "nav", "main", "footer"} & unique_html_tags
        and not re.search(r"\b(html basics|practice notes?|tutorial|lesson|example tags?|tag examples?)\b", lowered_content)
    ):
        return "complete website/project"

    if learning_notes_score >= 5 and learning_notes_score >= website_structure_score + 1:
        return "HTML/CSS/JS learning notes"

    if website_structure_score >= 5 and learning_notes_score < 5:
        return "complete website/project"

    if tutorial_signal_count >= 2 or html_comment_count >= 3 or diverse_practice_tag_count >= 4:
        return "HTML/CSS/JS learning notes"

    return "complete website/project"


def count_non_empty_lines(value: str) -> int:
    return len([line for line in value.splitlines() if line.strip()])


def has_unbalanced_code_delimiters(asset_text_content: str) -> bool:
    stripped_content = asset_text_content.strip()

    if not stripped_content:
        return True

    delimiter_pairs = [("{", "}"), ("(", ")"), ("[", "]")]

    return any(abs(stripped_content.count(opening) - stripped_content.count(closing)) >= 3 for opening, closing in delimiter_pairs)


def count_production_signals(asset_text_content: str) -> int:
    production_signal_patterns = [
        r"\btry\s*:|\btry\s*\{|\bcatch\s*\(|except\s+\w*|throw\s+new|raise\s+",
        r"\bvalidate|validation|sanitize|schema|safeparse|pydantic|zod|regex",
        r"\bauth|authorization|session|jwt|permission|role|rls|csrf|xss|sql injection",
        r"\btest\(|describe\(|expect\(|unittest|pytest|assert\s+",
        r"\btransaction|rollback|retry|timeout|cache|pagination|index|batch|stream",
        r"\bclass\s+\w+|interface\s+\w+|module\.exports|export\s+(async\s+)?function|def\s+\w+\(",
        r"\breadme|setup|install|usage|deployment|environment",
    ]

    return sum(1 for pattern in production_signal_patterns if re.search(pattern, asset_text_content, flags=re.IGNORECASE | re.MULTILINE))


def has_readme_completeness_signals(asset_text_content: str) -> bool:
    lowered_content = asset_text_content.lower()
    required_signal_count = sum(
        1
        for pattern in [
            r"\binstall|setup|getting started\b",
            r"\busage|example|how to run\b",
            r"\bdependenc|requirements|environment|\.env\b",
            r"\bscreenshot|demo|live link|preview\b",
            r"\barchitecture|features|api|folder structure\b",
        ]
        if re.search(pattern, lowered_content)
    )

    return required_signal_count >= 3


def has_beginner_code_signals(asset_name: str, asset_text_content: str, line_count: int) -> bool:
    lowered_name = asset_name.lower()
    lowered_content = asset_text_content.lower()
    tutorial_signals = re.search(
        r"\b(calculator|hello world|practice|exercise|tutorial|beginner|lesson|marks?|grade|todo|simple)\b",
        lowered_name + "\n" + lowered_content,
    )
    structural_signal_count = count_regex(
        r"\bclass\s+\w+|\bdef\s+\w+\(|\bfunction\s+\w+\(|=>|try\s*:|try\s*\{|catch\s*\(|except\s+|validate|schema|test\(",
        asset_text_content,
    )
    advanced_signal_count = count_regex(
        r"\bclass\s+\w+|\bstruct\s+\w+|\bvector\s*<|\bbool\s+\w+\s*\(|\bdouble\s+\w+\s*\(|\bconst\s+auto\b|\bfor\s*\(|\bvalid\w*\b",
        asset_text_content,
    )

    if advanced_signal_count >= 4 and re.search(r"\bvalid|invalid|error|empty|range|<=|>=\b", lowered_content):
        return False

    return bool(tutorial_signals) or (line_count < 75 and structural_signal_count <= 2)


def has_project_level_signals(asset_text_content: str, line_count: int) -> bool:
    return (
        line_count >= 160
        or count_regex(r"(^|\n)\s*(src/|app/|pages/|components/|lib/|api/|package\.json|requirements\.txt)", asset_text_content) >= 2
        or count_production_signals(asset_text_content) >= 5
    )


def derive_project_depth(detected_type: str, asset_text_content: str, line_count: int) -> str:
    if detected_type in {"config/package file", "general notes", "resume/portfolio text", "unknown file"}:
        return "low implementation evidence"
    if detected_type == "incomplete/broken file":
        return "broken/incomplete"
    if detected_type == "HTML/CSS/JS learning notes":
        return "learning material"
    if detected_type == "README/documentation":
        return "documentation-only" if not has_readme_completeness_signals(asset_text_content) else "strong documentation"
    if detected_type == "beginner practice code":
        return "beginner practice"
    if detected_type == "single code file":
        return "strong single-file project" if count_production_signals(asset_text_content) >= 4 and line_count >= 90 else "single-file component"
    if detected_type == "complete website/project":
        return "project-level" if has_project_level_signals(asset_text_content, line_count) else "small complete project"

    return "unknown"


def derive_recruiter_readiness(detected_type: str, project_depth: str) -> str:
    if detected_type == "complete website/project" and project_depth == "project-level":
        return "Potentially recruiter-ready after final polish"
    if detected_type == "single code file" and project_depth == "strong single-file project":
        return "Maybe, if paired with README/demo context"
    if detected_type == "README/documentation":
        return "No - documentation alone cannot verify coding ability"
    if detected_type in {"HTML/CSS/JS learning notes", "beginner practice code", "general notes", "config/package file"}:
        return "No - learning/practice artifact"
    if detected_type == "incomplete/broken file":
        return "No - incomplete or broken"

    return "No"


def determine_score_ceiling(detected_type: str, project_depth: str, asset_text_content: str) -> int:
    if detected_type == "incomplete/broken file":
        return 45
    if detected_type == "unknown file":
        return 39
    if detected_type == "config/package file":
        return 35
    if detected_type == "general notes":
        return 50
    if detected_type == "resume/portfolio text":
        return 55
    if detected_type == "HTML/CSS/JS learning notes":
        return 65
    if detected_type == "README/documentation":
        return 85 if has_readme_completeness_signals(asset_text_content) else 70
    if detected_type == "beginner practice code":
        has_validation = bool(re.search(r"\b(if|else|try|except|catch|validate|invalid|error|while)\b", asset_text_content, flags=re.IGNORECASE))
        has_structure = count_regex(r"\bclass\s+\w+|\bdef\s+\w+\(|\bfunction\s+\w+\(|\w+\s+\w+\s*\([^)]*\)\s*\{", asset_text_content) >= 2
        return 72 if has_validation and has_structure else 68
    if detected_type == "single code file":
        return 85 if project_depth == "strong single-file project" else 78
    if detected_type == "complete website/project":
        return 100 if project_depth == "project-level" else 88

    return 75


def classify_uploaded_asset(asset_name: str, asset_text_content: str) -> Dict[str, Any]:
    asset_name_lower = asset_name.lower().strip()
    base_asset_name = Path(asset_name_lower.replace("\\", "/")).name
    _, extension = os.path.splitext(asset_name_lower)
    language = detect_asset_language(asset_name, asset_text_content)
    stripped_content = asset_text_content.strip()
    lowered_content = stripped_content.lower()
    line_count = count_non_empty_lines(stripped_content)

    if not stripped_content or line_count <= 1 and len(stripped_content) < 30:
        detected_type = "incomplete/broken file"
    elif base_asset_name in CONFIG_FILE_NAMES or extension in CONFIG_EXTENSIONS:
        detected_type = "config/package file"
    elif language == "HTML":
        detected_type = classify_html_asset(asset_text_content)
    elif asset_name_lower == "readme" or base_asset_name == "readme" or base_asset_name.startswith("readme.") or extension in {".md", ".mdx"}:
        detected_type = "README/documentation"
    elif re.search(r"\b(resume|curriculum vitae|portfolio|experience|education|skills|linkedin|github)\b", lowered_content) and extension in {".txt", ".pdf", ".docx"}:
        detected_type = "resume/portfolio text"
    elif has_unbalanced_code_delimiters(stripped_content) and extension in CODE_EXTENSIONS and line_count >= 4:
        detected_type = "incomplete/broken file"
    elif has_project_level_signals(stripped_content, line_count):
        detected_type = "complete website/project"
    elif language in {
        "C",
        "C++",
        "C/C++ Header",
        "C#",
        "Go",
        "Java",
        "JavaScript",
        "JavaScript/TypeScript",
        "JavaScript React (JSX)",
        "Kotlin",
        "PHP",
        "Python",
        "Ruby",
        "Rust",
        "Shell",
        "SQL",
        "Swift",
        "TypeScript",
        "TypeScript React (TSX)",
        "Vue",
    }:
        detected_type = "beginner practice code" if has_beginner_code_signals(asset_name, stripped_content, line_count) else "single code file"
    elif count_regex(r"^\s*[-*]\s+|\b(notes?|summary|todo|ideas?|learning|study|lecture|concepts?)\b", stripped_content) >= 3:
        detected_type = "general notes"
    else:
        detected_type = "unknown file"

    complexity_level = "unknown"
    if detected_type == "HTML/CSS/JS learning notes":
        complexity_level = "beginner-to-intermediate" if count_regex(r"<(form|table|video|audio|iframe|section|article)\b", lowered_content) >= 3 else "beginner"
    elif detected_type == "complete website/project":
        complexity_level = "advanced" if count_production_signals(stripped_content) >= 5 else "intermediate"
    elif detected_type == "single code file":
        complexity_level = "intermediate" if count_production_signals(stripped_content) >= 3 or line_count >= 90 else "beginner-to-intermediate"
    elif detected_type == "beginner practice code":
        complexity_level = "beginner"
    elif detected_type == "README/documentation":
        complexity_level = "intermediate" if has_readme_completeness_signals(stripped_content) else "basic"
    elif detected_type in {"general notes", "resume/portfolio text", "config/package file"}:
        complexity_level = "low implementation signal"
    elif detected_type == "incomplete/broken file":
        complexity_level = "broken/incomplete"

    project_depth = derive_project_depth(detected_type, stripped_content, line_count)
    recruiter_readiness = derive_recruiter_readiness(detected_type, project_depth)
    score_ceiling = determine_score_ceiling(detected_type, project_depth, stripped_content)

    return {
        "detectedType": detected_type,
        "language": language,
        "reviewMode": REVIEW_MODE_BY_DETECTED_TYPE.get(detected_type, "general artifact review"),
        "complexityLevel": complexity_level,
        "projectDepth": project_depth,
        "recruiterReadiness": recruiter_readiness,
        "scoreCeiling": score_ceiling,
    }


ENHANCED_AUDIT_SYSTEM_PROMPT = """You are a meticulous Tech Lead reviewing a developer's project.
RULE 1 (TONE): Be professional, punchy, and engaging.
RULE 2 (FORMAT): Every bullet point MUST follow a 'Catchy Hook: Short explanation' format (e.g., 'Flawless Error Handling: Async functions use try/catch blocks perfectly').
RULE 3 (BREVITY): No essays. Keep every item under 15 words.
RULE 4 (LIMITS): Maximum 4 items per array.
RULE (FORMATTING - ABSOLUTE REQUIREMENT): You MUST use a 'Catchy Hook: Short explanation' format. NO EXCEPTIONS.
RULE (BREVITY - ABSOLUTE REQUIREMENT): Every item MUST be under 15 words total. NO ESSAYS."""


AUDIT_RESPONSE_FORMAT = {"type": "json_object"}


def normalize_audit_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []

    normalized_items = []

    for item in value:
        normalized_item = str(item).strip()
        if normalized_item:
            normalized_items.append(normalized_item)

    return normalized_items[:4]


def sanitize_audit_summary(value: Any) -> str:
    description = str(value or "").strip()

    if not description:
        return ""

    description = re.sub(r"^\s*```(?:json|markdown|md)?\s*", "", description, flags=re.IGNORECASE)
    description = re.sub(r"\s*```\s*$", "", description)
    description = re.sub(r"(?im)^\s*#{1,6}\s*executive summary\s*$", "", description)
    description = re.sub(r"(?im)^\s*Grade:\s*N/A\s*$", "", description)
    description = re.sub(
        r"(?is)\bNo\s+executive\s+summary\s+has\s+been\s+generated\s+yet\.?\s*(?:Grade:\s*N/A)?",
        "",
        description,
    )

    description = re.sub(r"\n{3,}", "\n\n", description).strip()

    return description


def normalize_detected_type(value: str, fallback_value: str = "unknown") -> str:
    normalized_lookup = {allowed_value.lower(): allowed_value for allowed_value in ALLOWED_DETECTED_TYPES}
    raw_value = str(value or "").strip().lower()
    raw_fallback = str(fallback_value or "").strip().lower()
    normalized_value = normalized_lookup.get(raw_value) or DETECTED_TYPE_ALIASES.get(raw_value)
    normalized_fallback = normalized_lookup.get(raw_fallback) or DETECTED_TYPE_ALIASES.get(raw_fallback) or "unknown file"

    if normalized_value and normalized_value != "unknown file":
        return normalized_value

    return normalized_fallback


def normalize_recruiter_readiness(value: str, detected_type: str, score: int) -> str:
    normalized_value = str(value or "").strip()
    lowered_value = normalized_value.lower()

    if score >= 90 and detected_type == "complete website/project":
        return "Yes - recruiter-ready"
    if score >= 80 and detected_type in {"complete website/project", "single code file"}:
        return "Close - needs final portfolio polish"
    if "yes" in lowered_value and detected_type not in {"complete website/project", "single code file"}:
        return "No - not enough standalone coding evidence"

    return normalized_value or derive_recruiter_readiness(detected_type, "unknown")


def ensure_executive_summary_context(audit_response: AuditResponse) -> str:
    context_sentence = (
        f"Detected Type: {audit_response.detectedType}. "
        f"Review Mode: {audit_response.reviewMode}. "
        f"Complexity: {audit_response.complexityLevel}. "
        f"Project Depth: {audit_response.projectDepth}. "
        f"Recruiter Ready: {audit_response.recruiterReadiness}. "
    )
    existing_summary = audit_response.executiveSummary.strip()

    if "Detected Type:" in existing_summary and "Recruiter Ready:" in existing_summary:
        return existing_summary

    return f"{context_sentence}{existing_summary}".strip()


def parse_audit_response(raw_content: str | None, asset_classification: Dict[str, Any] | None = None) -> AuditResponse:
    if not raw_content or not raw_content.strip():
        raise HTTPException(
            status_code=502,
            detail="AI audit response was empty.",
        )

    try:
        parsed_content = json.loads(raw_content)
    except json.JSONDecodeError as parse_error:
        raise HTTPException(
            status_code=502,
            detail="AI audit response was not valid JSON.",
        ) from parse_error

    try:
        audit_response = AuditResponse.model_validate(parsed_content)
    except ValidationError as validation_error:
        raise HTTPException(
            status_code=502,
            detail="AI audit response did not match the required schema.",
        ) from validation_error

    audit_response.ai_summary = sanitize_audit_summary(audit_response.ai_summary)
    if not audit_response.ai_summary:
        raise HTTPException(
            status_code=502,
            detail="AI audit response was missing the required ai_summary.",
        )

    audit_response.score = max(0, min(100, int(round(float(audit_response.score)))))
    audit_response.strengths = normalize_audit_list(audit_response.strengths)
    audit_response.weaknesses = normalize_audit_list(audit_response.weaknesses)
    audit_response.recommendations = normalize_audit_list(audit_response.recommendations)

    return audit_response


def get_audit_file_name(file_record: Dict[str, Any]) -> str:
    file_name = (
        file_record.get("name")
        or file_record.get("title")
        or file_record.get("file_name")
        or file_record.get("id")
        or "Unknown file"
    )

    return str(file_name).strip() or "Unknown file"


async def load_audit_file_content(file_record: Dict[str, Any]) -> str:
    raw_content = (
        file_record.get("raw_content")
        or file_record.get("content")
        or file_record.get("asset_text_content")
    )

    if raw_content is not None and str(raw_content).strip():
        return str(raw_content)[:AUDIT_FILE_CONTENT_CHAR_LIMIT]

    file_url = str(file_record.get("file_url") or "").strip()
    if file_url.startswith(("http://", "https://")):
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as http_client:
                response = await http_client.get(file_url)
                response.raise_for_status()
                fetched_content = response.text.strip()

            if fetched_content:
                return fetched_content[:AUDIT_FILE_CONTENT_CHAR_LIMIT]
        except Exception as fetch_error:
            logger.warning(
                "project_audit.file_fetch_failed file=%s error=%s",
                get_audit_file_name(file_record),
                fetch_error,
            )

    return "No content found"


async def mark_project_file_audited(
    file_record: Dict[str, Any],
    audit_result: str,
    supabase_client: Any,
) -> None:
    file_id = str(file_record.get("id") or "").strip()
    if not file_id:
        return

    file_user_id = str(file_record.get("user_id") or "").strip()
    update_payload = {
        "status": "audited",
        "has_been_audited": True,
        "audit_summary": audit_result,
        "ai_summary": audit_result,
    }

    try:
        def update_project_file(payload: Dict[str, Any]):
            query = supabase_client.table("projects").update(payload).eq("id", file_id)
            if file_user_id:
                query = query.eq("user_id", file_user_id)
            return query.execute()

        await asyncio.to_thread(lambda: update_project_file(update_payload))
    except Exception as status_update_error:
        logger.warning(
            "project_audit.status_update_failed file=%s error=%s",
            get_audit_file_name(file_record),
            status_update_error,
        )
        fallback_payload = dict(update_payload)
        fallback_payload.pop("status", None)
        await asyncio.to_thread(lambda: update_project_file(fallback_payload))


# ---------------------------------------------------------
# THE MAP PHASE: Audit individual files concurrently
# ---------------------------------------------------------
async def audit_single_file(file_record: dict, supabase_client: Any | None = None) -> dict:
    file_name = get_audit_file_name(file_record)

    try:
        if supabase_client is None:
            supabase_client = supabase or get_supabase_service_client() or get_supabase_backend_client()

        file_content = await load_audit_file_content(file_record)

        prompt = f"""
        Context: You are a Staff-level Software Engineer doing a security and architecture audit.
        File Name: {file_name}

        Do NOT comment on formatting, styling, or basic best practices.
        Identify critical logic flaws, security vulnerabilities, state management errors, and unhandled edge cases.
        Be concise and direct.

        Code to audit:
        {file_content}
        """

        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a brutal, highly technical code auditor. Return a short summary of critical issues.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=500,
            temperature=0.1,
        )

        audit_result = response.choices[0].message.content or "No critical issues returned."

        await mark_project_file_audited(file_record, audit_result, supabase_client)

        return {
            "file_name": file_name,
            "issues": audit_result,
        }
    except Exception as error:
        logger.exception("project_audit.file_failed file=%s", file_name)
        return {"file_name": file_name, "issues": "Audit failed for this file."}


# ---------------------------------------------------------
# THE API ENDPOINT & REDUCE PHASE: Trigger the Audit
# ---------------------------------------------------------
@app.post("/api/audit-project")
async def run_project_audit(
    payload: AuditRequest,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    folder_id = payload.folder_id.strip()
    requested_user_id = payload.user_id.strip()

    if not folder_id or not requested_user_id:
        raise HTTPException(status_code=400, detail="folder_id and user_id are required.")

    if requested_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="You can only audit your own project folder.")

    try:
        supabase_client = get_request_supabase_client(request)

        db_response = await asyncio.to_thread(
            lambda: supabase_client.table("projects")
            .select("*")
            .eq("folder_id", folder_id)
            .eq("user_id", requested_user_id)
            .execute()
        )
        files = db_response.data if isinstance(db_response.data, list) else []

        if not files:
            raise HTTPException(status_code=404, detail="No files found in this folder.")

        tasks = [audit_single_file(file_record, supabase_client) for file_record in files]
        file_reports = await asyncio.gather(*tasks)
        reports_json = json.dumps(file_reports, ensure_ascii=False)
        if len(reports_json) > AUDIT_REDUCE_REPORT_CHAR_LIMIT:
            reports_json = reports_json[:AUDIT_REDUCE_REPORT_CHAR_LIMIT] + "\n...[truncated]"

        aggregated_file_summaries = reports_json

        final_response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an elite Tech Lead and Principal Software Architect conducting a comprehensive repository-level code audit for MeliusAI. "
                        "Your objective is to evaluate this codebase on two fronts: 'Beauty' (Macro-Architecture) and 'Brains' (Practical Execution).\n\n"
                        "CRITICAL EVALUATION RULES:\n"
                        "1. THE BEAUTY (Architecture & Wires): Analyze the connective tissue of the project. Are they using clean design patterns? "
                        "Is there a logical separation of concerns (e.g., UI vs. Business Logic vs. Database Access)? Identify circular dependencies, missing abstraction layers, or poor structural organization.\n"
                        "2. THE BRAINS (Execution & Logic): Evaluate if the files actually serve their intended purpose effectively. Look for severe logic flaws, "
                        "unhandled edge cases, security vulnerabilities (e.g., missing auth, exposed data), and performance bottlenecks.\n"
                        "3. PINPOINT QUALITY DEGRADATION: Explicitly identify where the project is strong and where it falls apart. "
                        "(Example: 'The React UI components are modular and clean, but the API routing degrades in quality because it is tightly coupled to raw database queries.')\n"
                        "4. NO NITPICKING: Ignore minor formatting, missing semicolons, or local variable naming choices. Focus entirely on structural integrity and critical execution failures.\n\n"
                        "OUTPUT FORMAT:\n"
                        "You must return a strict JSON object with the exact following structure:\n"
                        "{\n"
                        "  \"melius_score\": (integer 1-100, a blended score of structural beauty and functional brains. Be brutal but fair. 90+ is production-ready, <50 is a structural mess),\n"
                        "  \"executive_summary\": \"A 3-4 sentence overall assessment of the project's architecture and code quality.\",\n"
                        "  \"strengths\": [\n"
                        "    \"Detailed architectural or functional strength #1, referencing specific patterns or files.\",\n"
                        "    \"Strength #2...\",\n"
                        "    \"Strength #3...\"\n"
                        "  ],\n"
                        "  \"weaknesses\": [\n"
                        "    \"Severe structural flaw or area where code quality degrades, referencing specific files.\",\n"
                        "    \"Weakness #2...\",\n"
                        "    \"Weakness #3...\"\n"
                        "  ],\n"
                        "  \"top_recommendations\": [\n"
                        "    \"Actionable, code-level architectural fix #1 (e.g., 'Extract DB queries from api.py into a centralized service layer').\",\n"
                        "    \"Actionable fix #2...\",\n"
                        "    \"Actionable fix #3...\"\n"
                        "  ]\n"
                        "}"
                    ),
                },
                {
                    "role": "user",
                    "content": f"Here is the directory structure map and the individual file-level audit summaries for this project:\n\n{aggregated_file_summaries}\n\nPlease perform the comprehensive MeliusAI Tech Lead audit now.",
                },
            ],
        )

        project_summary = final_response.choices[0].message.content or ""

        await asyncio.to_thread(
            lambda: supabase_client.table("project_folders")
            .update({"audit_summary": project_summary})
            .eq("id", folder_id)
            .eq("user_id", requested_user_id)
            .execute()
        )

        return {
            "message": "Audit complete",
            "file_reports": file_reports,
            "project_summary": project_summary,
        }

    except HTTPException:
        raise
    except Exception as error:
        logger.exception("project_audit.failed folder_id=%s", folder_id)
        raise HTTPException(status_code=500, detail=str(error)) from error


class MatchTalentRequest(BaseModel):
    prompt: str
    organization_id: str | None = None


class SearchRequest(BaseModel):
    query: str


class DismissOpportunityRequest(BaseModel):
    candidate_id: str | None = None
    opportunity_id: str


class ProcessProfileRequest(BaseModel):
    user_id: str
    bio: str


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
        "extracted_experience",
        "extracted_preferences",
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
        "file_type",
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
    embedding_response = sync_client.embeddings.create(
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


async def extract_profile_internal_keywords(bio: str) -> List[str]:
    clean_bio = bio.strip()

    if not clean_bio:
        return []

    try:
        keyword_completion = await client.chat.completions.create(
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


async def run_profile_ai_processing(
    supabase_client: Any,
    user_id: str,
    bio: str,
) -> None:
    clean_user_id = str(user_id or "").strip()
    clean_bio = str(bio or "").strip()
    print(
        f"--- PROFILE PROCESSING START: user_id={clean_user_id}, bio_length={len(clean_bio)} ---",
        flush=True,
    )

    if not clean_user_id:
        print("--- PROFILE PROCESSING ABORTED: missing user_id ---", flush=True)
        return

    if not clean_bio:
        print(f"--- PROFILE PROCESSING ABORTED: empty bio for user_id={clean_user_id} ---", flush=True)
        return

    extracted_data = ProfileExtraction(
        skills=[],
        internal_keywords=[],
        extracted_experience=[],
        extracted_preferences=[],
    )

    try:
        print(f"--- PROFILE PROCESSING: Starting LLM extraction for user_id={clean_user_id} ---", flush=True)
        extracted_data = await extract_profile_processing_fields(clean_bio)
        print(
            "--- PROFILE PROCESSING: LLM extraction complete "
            f"for user_id={clean_user_id}; skills={len(extracted_data.skills)}, "
            f"keywords={len(extracted_data.internal_keywords)} ---",
            flush=True,
        )
    except Exception as extraction_error:
        print(f"Extraction failed: {extraction_error}", flush=True)
        return

    try:
        print(f"--- PROFILE PROCESSING: Starting internal keyword expansion for user_id={clean_user_id} ---", flush=True)
        fallback_keywords = await extract_profile_internal_keywords(clean_bio)
        combined_keywords = normalize_profile_processing_list(
            list(extracted_data.internal_keywords) + fallback_keywords
        )
        if combined_keywords:
            extracted_data.internal_keywords = combined_keywords
        if not extracted_data.skills and combined_keywords:
            extracted_data.skills = combined_keywords[:12]
        print(
            "--- PROFILE PROCESSING: Keyword expansion complete "
            f"for user_id={clean_user_id}; keywords={len(extracted_data.internal_keywords)} ---",
            flush=True,
        )
    except Exception as keyword_error:
        print(f"Keyword extraction failed: {keyword_error}", flush=True)

    profile_embedding: List[float] | None = None
    try:
        print(f"--- PROFILE PROCESSING: Starting embedding generation for user_id={clean_user_id} ---", flush=True)
        embedding_text = build_profile_embedding_text(
            {
                "bio": clean_bio,
                "skills": extracted_data.skills,
                "internal_keywords": extracted_data.internal_keywords,
                "extracted_experience": extracted_data.extracted_experience,
                "extracted_preferences": extracted_data.extracted_preferences,
            }
        )

        if not embedding_text.strip():
            print(f"Embedding skipped: no semantic profile text for user_id={clean_user_id}", flush=True)
        else:
            profile_embedding = await asyncio.to_thread(
                lambda: fetch_openai_embeddings([embedding_text])[0]
            )
            print(
                "--- PROFILE PROCESSING: Embedding generated "
                f"for user_id={clean_user_id}; dimensions={len(profile_embedding)} ---",
                flush=True,
            )
    except Exception as embedding_error:
        print(f"Embedding failed: {embedding_error}", flush=True)

    try:
        print(f"--- PROFILE PROCESSING: Updating Supabase profile for user_id={clean_user_id} ---", flush=True)
        update_payload: Dict[str, Any] = {
            "skills": list(extracted_data.skills),
            "internal_keywords": list(extracted_data.internal_keywords),
            "extracted_experience": list(extracted_data.extracted_experience),
            "extracted_preferences": list(extracted_data.extracted_preferences),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if profile_embedding:
            update_payload["profile_embedding"] = profile_embedding

        profile_update_response = await asyncio.to_thread(
            lambda: supabase_client.table("profiles")
            .update(update_payload)
            .eq("id", clean_user_id)
            .execute()
        )

        updated_rows = profile_update_response.data if profile_update_response and hasattr(profile_update_response, "data") else []
        print(
            "--- PROFILE PROCESSING SUCCESS: Supabase update complete "
            f"for user_id={clean_user_id}; rows={len(updated_rows or [])}; keys={list(update_payload.keys())} ---",
            flush=True,
        )
    except Exception as update_error:
        print(f"Supabase profile enrichment update failed: {update_error}", flush=True)
        if "update_payload" in locals() and "profile_embedding" in update_payload:
            try:
                print(
                    "--- PROFILE PROCESSING: Retrying Supabase update without profile_embedding "
                    f"for user_id={clean_user_id} ---",
                    flush=True,
                )
                fallback_payload = dict(update_payload)
                fallback_payload.pop("profile_embedding", None)
                fallback_response = await asyncio.to_thread(
                    lambda: supabase_client.table("profiles")
                    .update(fallback_payload)
                    .eq("id", clean_user_id)
                    .execute()
                )
                fallback_rows = fallback_response.data if fallback_response and hasattr(fallback_response, "data") else []
                print(
                    "--- PROFILE PROCESSING PARTIAL SUCCESS: Extracted fields saved without embedding "
                    f"for user_id={clean_user_id}; rows={len(fallback_rows or [])} ---",
                    flush=True,
                )
            except Exception as fallback_update_error:
                print(f"Supabase fallback enrichment update failed: {fallback_update_error}", flush=True)


@app.post("/api/process-profile")
async def process_profile(
    payload: ProcessProfileRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    target_user_id = str(payload.user_id or "").strip()
    clean_bio = str(payload.bio or "").strip()
    print(
        f"--- PROFILE PROCESSING WEBHOOK: received user_id={target_user_id}, "
        f"auth_user_id={current_user_id}, bio_length={len(clean_bio)} ---",
        flush=True,
    )

    if not target_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    if target_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot process another user's profile")

    if not clean_bio:
        return {"success": False, "message": "Profile processing skipped: empty bio."}

    try:
        supabase_client = get_supabase_service_client()
        if supabase_client is None:
            print(
                "--- PROFILE PROCESSING WARNING: SUPABASE_SERVICE_ROLE_KEY is not configured; "
                "falling back to request-scoped Supabase client. ---",
                flush=True,
            )
            supabase_client = get_request_supabase_client(request)
    except Exception as client_error:
        print(f"Supabase client initialization failed: {client_error}", flush=True)
        raise HTTPException(status_code=500, detail="Unable to initialize Supabase client") from client_error

    background_tasks.add_task(run_profile_ai_processing, supabase_client, target_user_id, clean_bio)
    return {"success": True, "status": "queued", "user_id": target_user_id}


@app.post("/api/profile/sync-embedding")
async def sync_single_profile_embedding(
    request: Request,
    current_user_id: str = Depends(verify_user),
):
    data = await request.json()

    try:
        supabase = get_request_supabase_client(request)

        # 1. ALWAYS fetch the full existing profile first
        existing_profile_res = await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .select("*")
            .eq("id", current_user_id)
            .maybe_single()
            .execute()
        )
        existing_profile = existing_profile_res.data or {}

        # 2. Merge the new incoming data INTO the existing profile data
        # This prevents partial frontend payloads from wiping out the rest of the vector
        merged_profile = {**existing_profile, **data}

        # 3. Build the text using the fully merged dataset
        profile_text = build_profile_embedding_text(merged_profile)

        if not profile_text.strip():
            return {"success": False, "message": "Profile vector sync skipped: no semantic profile text found."}

        print(f"--- SYNC ENGINE DEBUG: Vectorizing User '{merged_profile.get('username')}' with text length: {len(profile_text)} ---")
        
        internal_keywords = await extract_profile_internal_keywords(str(merged_profile.get("bio", "")))
        
        # 4. Generate the new embedding using the complete profile
        new_embedding = await asyncio.to_thread(lambda: fetch_openai_embeddings([profile_text])[0])
        
        update_payload = {"profile_embedding": new_embedding}
        if internal_keywords:
            update_payload["internal_keywords"] = internal_keywords

        await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .update(update_payload)
            .eq("id", current_user_id)
            .execute()
        )
        print("--- ML SUCCESS: Automatically synchronized complete profile vector ---")

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
    token: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    target_username = username.strip().lower()
    if not target_username:
        print("--- SPECTATE PROFILE FAILED: empty username parameter ---")
        raise HTTPException(status_code=404, detail="Profile not found")

    supabase = get_supabase_service_client()
    if supabase is None:
        print(
            "--- SPECTATE PROFILE FAILED: SUPABASE_SERVICE_ROLE_KEY is not configured, "
            "so the service-role client could not be initialized ---"
        )
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_SERVICE_ROLE_KEY is required for spectator profile reads.",
        )

    profile_response = await asyncio.to_thread(
        lambda: supabase.table("profiles")
        .select(SPECTATE_PROFILE_PUBLIC_SELECT)
        .eq("username", target_username)
        .execute()
    )
    profile_rows = profile_response.data or []

    if not isinstance(profile_rows, list):
        print(
            "--- SPECTATE PROFILE FAILED: Supabase profiles query returned an unexpected "
            f"data shape for username '{target_username}': {type(profile_rows).__name__} ---"
        )
        raise HTTPException(status_code=404, detail="Profile not found")

    if len(profile_rows) == 0:
        print(
            "--- SPECTATE PROFILE FAILED: no profile row found for username "
            f"'{target_username}' using service-role client ---"
        )
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = dict(profile_rows[0])
    profile_uuid = profile.get("id") or profile.get("user_id")
    current_user_id, authentication_status = await resolve_request_user(
        request,
        token,
        required=False,
    )
    profile_owner_id = str(profile_uuid or "").strip() or None
    is_owner = bool(
        current_user_id
        and profile_owner_id
        and current_user_id == profile_owner_id
    )
    viewer_type = "owner" if is_owner else "visitor"
    profile["email"] = None

    if profile_uuid:
        profile_uuid_text = str(profile_uuid)
        email_result, projects_result = await asyncio.gather(
            fetch_auth_email_for_profile(supabase, profile_uuid_text),
            fetch_project_rows_for_profile(supabase, profile_uuid_text),
            return_exceptions=True,
        )

        if isinstance(email_result, Exception):
            logger.warning("Unable to hydrate spectator profile email: %s", email_result)
            profile["email"] = None
        else:
            profile["email"] = email_result

        if isinstance(projects_result, Exception):
            logger.warning("Unable to hydrate spectator profile projects: %s", projects_result)
            profile["projects"] = []
        else:
            profile["projects"] = (
                projects_result
                if is_owner
                else [
                    project
                    for project in projects_result
                    if project.get("is_public") is not False
                ]
            )
    else:
        print(
            "--- SPECTATE PROFILE EMAIL SKIPPED: profile row for username "
            f"'{target_username}' has no id or user_id value ---"
        )
        profile["projects"] = []

    scan_rows = build_project_scan_rows(profile["projects"])
    profile["ratings"] = scan_rows
    profile["scores"] = scan_rows
    profile["scans"] = scan_rows

    profile["isOwner"] = is_owner
    profile["viewerType"] = viewer_type
    profile["authenticationStatus"] = authentication_status

    runtime_environment = (
        os.getenv("ENVIRONMENT")
        or os.getenv("APP_ENV")
        or os.getenv("NODE_ENV")
        or "development"
    ).strip().lower()
    if runtime_environment not in {"prod", "production"}:
        logger.info(
            "Spectate profile owner detection: username=%s auth_status=%s "
            "authenticated_user_id=%s profile_owner_id=%s is_owner=%s",
            target_username,
            authentication_status,
            current_user_id,
            profile_owner_id,
            is_owner,
        )

    return {
        **profile,
        "success": True,
        "profile": profile,
        "resume": profile,
        "projects": profile["projects"],
        "vault_assets": profile["projects"],
        "vaultAssets": profile["projects"],
        "ratings": scan_rows,
        "scores": scan_rows,
        "scans": scan_rows,
        "isOwner": is_owner,
        "viewerType": viewer_type,
        "authenticationStatus": authentication_status,
    }


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


@app.post("/api/create-oppurtunity", status_code=201)
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
        access_token = get_request_access_token(request)
        jwt_user_id = decode_supabase_jwt_sub(access_token)
        if jwt_user_id != current_user_id:
            raise HTTPException(status_code=401, detail="Invalid bearer token")

        authenticated_supabase = get_supabase_authenticated_client(access_token)
        request.state.supabase = authenticated_supabase

        service_supabase = get_supabase_service_client()
        if service_supabase is None:
            raise HTTPException(
                status_code=500,
                detail="SUPABASE_SERVICE_ROLE_KEY is required for opportunity creation writes.",
            )

        validation_supabase = service_supabase
        organization_response = await asyncio.to_thread(
            lambda: validation_supabase.table("organizations")
            .select("*")
            .eq("user_id", current_user_id)
            .limit(1)
            .execute()
        )
        organization_rows = organization_response.data or []
        organization = organization_rows[0] if organization_rows else {}
        resolved_organization_id = str(organization.get("id") or "").strip()
        requested_organization_id = str(payload.organization_id or "").strip()
        authorized_organization_ids = {
            organization_id
            for organization_id in (resolved_organization_id, jwt_user_id)
            if organization_id
        }

        if requested_organization_id and requested_organization_id not in authorized_organization_ids:
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to create opportunities for this organization",
            )

        organization_id = requested_organization_id or jwt_user_id
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

        try:
            opportunity_response = await asyncio.to_thread(
                lambda: service_supabase.table("opportunities")
                .insert(insert_data)
                .execute()
            )
        except Exception as insert_error:
            if is_supabase_rls_error(insert_error):
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Opportunity insert was blocked by Supabase RLS. "
                        "Set SUPABASE_SERVICE_ROLE_KEY on the backend or add an authenticated insert policy "
                        "for organization opportunity creation."
                    ),
                ) from insert_error
            raise

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
    organization_id: str | None = None,
):
    try:
        supabase = get_supabase_service_client() or get_request_supabase_client(request)
        organization_response = await asyncio.to_thread(
            lambda: supabase.table("organizations")
            .select("id")
            .eq("user_id", current_user_id)
            .limit(1)
            .execute()
        )
        organization_rows = organization_response.data or []
        resolved_organization_id = str(
            (organization_rows[0] if organization_rows else {}).get("id") or current_user_id
        ).strip()
        requested_organization_id = str(
            organization_id or request.headers.get("x-organization-id") or ""
        ).strip()
        authorized_organization_ids = {
            value
            for value in (resolved_organization_id, current_user_id)
            if value
        }

        if requested_organization_id and requested_organization_id not in authorized_organization_ids:
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to view opportunities for this organization",
            )

        scoped_organization_id = requested_organization_id or resolved_organization_id
        opportunities_response = await asyncio.to_thread(
            lambda: apply_opportunity_organization_scope(
                supabase.table("opportunities").select(
                    "id, organization_id, recruiter_name, role_title, core_skills, "
                    "company_email, status, created_at, description"
                ),
                scoped_organization_id,
                current_user_id,
            )
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
            lambda: apply_opportunity_organization_scope(
                supabase.table("opportunities")
                .update(
                    {
                        "role_title": job_title,
                        "description": core_requirements,
                        "core_skills": core_skills,
                    }
                )
                .eq("id", opportunity_id),
                organization_id,
                current_user_id,
            )
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
            lambda: apply_opportunity_organization_scope(
                supabase.table("opportunities")
                .delete()
                .eq("id", opportunity_id),
                organization_id,
                current_user_id,
            )
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
    resolved_candidate_id = str(current_user_id or "").strip()
    if not resolved_candidate_id:
        raise HTTPException(status_code=400, detail="Candidate profile id is required")

    try:
        supabase = get_supabase_read_client(request)

        print(f"Fetching profile for user_id: {resolved_candidate_id}")
        profile_response = await asyncio.to_thread(
            lambda: supabase.table("profiles")
            .select("skills")
            .eq("id", resolved_candidate_id)
            .maybe_single()
            .execute()
        )

        if not profile_response or not hasattr(profile_response, "data"):
            print("Error: Supabase returned None for profile_response.")
            return JSONResponse(content=[])

        candidate_profile = profile_response.data
        if not isinstance(candidate_profile, dict) or not candidate_profile:
            print(f"Profile not found for user_id: {resolved_candidate_id}")
            return JSONResponse(content=[])

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
            dismissal_error_text = str(dismissal_lookup_error)
            if "PGRST205" in dismissal_error_text:
                logger.warning(
                    "Opportunity dismissal table is not in the PostgREST schema cache yet."
                )
                dismissals_response = None
            else:
                raise

        dismissed_opportunity_ids = [
            str(dismissal.get("opportunity_id") or "").strip()
            for dismissal in ((dismissals_response.data or []) if dismissals_response else [])
            if dismissal.get("opportunity_id")
        ]

        opportunities_query = (
            supabase.table("opportunities")
            .select("*, organization_id")
            .eq("status", "active")
        )

        if dismissed_opportunity_ids:
            dismissed_ids_filter = ",".join(dismissed_opportunity_ids)
            opportunities_query = opportunities_query.filter(
                "id",
                "not.in",
                f"({dismissed_ids_filter})",
            )

        opportunities_response = await asyncio.to_thread(
            lambda: opportunities_query
            .order("created_at", desc=True)
            .execute()
        )

        matched_alerts = []
        manifesto_by_recruiter = {}
        for opportunity in opportunities_response.data or []:
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
        project_id = (payload.projectId or "").strip()
        asset_name = (payload.assetName or "Project Asset").strip() or "Project Asset"
        asset_text_content = payload.code.strip()
        user_context_description = (payload.userContextDescription or "").strip()

        if not asset_text_content:
            raise HTTPException(
                status_code=400,
                detail="Uploaded content cannot be empty.",
            )

        asset_name_lower = asset_name.lower()

        def decode_asset_bytes(encoded_asset: str) -> bytes:
            base64_payload = (
                encoded_asset.split(",", 1)[1]
                if encoded_asset.startswith("data:") and "," in encoded_asset
                else encoded_asset
            )
            return base64.b64decode("".join(base64_payload.split()), validate=True)

        if asset_name_lower.endswith(".pdf") or asset_text_content.startswith("data:application/pdf;base64,"):
            pdf_reader = pypdf.PdfReader(io.BytesIO(decode_asset_bytes(asset_text_content)))
            extracted_page_blocks = []
            extracted_page_text = []

            for page_index, page in enumerate(pdf_reader.pages, start=1):
                page_text = page.extract_text(extraction_mode="layout") or ""
                extracted_page_text.append(page_text)
                extracted_page_blocks.append(f"--- [DOCUMENT PAGE {page_index}] ---\n{page_text.strip()}")

            if not "\n".join(extracted_page_text).strip():
                raise HTTPException(
                    status_code=422,
                    detail="Unable to extract text from the uploaded PDF asset.",
                )

            asset_text_content = "\n\n".join(extracted_page_blocks).strip()

        elif asset_name_lower.endswith(".pptx") or asset_text_content.startswith(
            "data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,"
        ):
            presentation = Presentation(io.BytesIO(decode_asset_bytes(asset_text_content)))
            extracted_slide_blocks = []
            extracted_slide_text = []

            for slide_index, slide in enumerate(presentation.slides, start=1):
                slide_lines = [f"--- [PRESENTATION SLIDE {slide_index}] ---"]
                title_shape = slide.shapes.title

                if title_shape is not None:
                    title_text = (getattr(title_shape, "text", "") or "").strip()
                    if title_text:
                        slide_lines.append(f"[TITLE]\n{title_text}")
                        extracted_slide_text.append(title_text)

                for shape in slide.shapes:
                    if title_shape is not None and shape == title_shape:
                        continue

                    if getattr(shape, "has_table", False):
                        table_rows = []
                        for row in shape.table.rows:
                            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                            if cells:
                                table_rows.append(" | ".join(cells))

                        if table_rows:
                            table_text = "\n".join(table_rows)
                            slide_lines.append(f"[TABLE]\n{table_text}")
                            extracted_slide_text.append(table_text)

                    if getattr(shape, "has_text_frame", False):
                        shape_text = (getattr(shape, "text", "") or "").strip()
                        if shape_text:
                            slide_lines.append(shape_text)
                            extracted_slide_text.append(shape_text)

                extracted_slide_blocks.append("\n".join(slide_lines))

            if not "\n".join(extracted_slide_text).strip():
                raise HTTPException(
                    status_code=422,
                    detail="Unable to extract text from the uploaded PPTX asset.",
                )

            asset_text_content = "\n\n".join(extracted_slide_blocks).strip()

        elif asset_text_content.startswith("data:"):
            try:
                asset_text_content = decode_asset_bytes(asset_text_content).decode("utf-8", errors="replace").strip()
            except Exception:
                pass

        else:
            try:
                decoded_text_content = decode_asset_bytes(asset_text_content).decode("utf-8")
                if decoded_text_content.strip():
                    asset_text_content = decoded_text_content.strip()
            except Exception:
                pass

        asset_classification = classify_uploaded_asset(asset_name, asset_text_content)

        completion = sync_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": ENHANCED_AUDIT_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": (
                        "Uploaded Artifact Metadata:\n"
                        f"- Asset name: {asset_name}\n"
                        f"- Pre-review detected type: {asset_classification['detectedType']}\n"
                        f"- Pre-review language: {asset_classification['language']}\n"
                        f"- Pre-review mode: {asset_classification['reviewMode']}\n"
                        f"- Pre-review complexity level: {asset_classification['complexityLevel']}\n"
                        f"- Pre-review project depth: {asset_classification['projectDepth']}\n"
                        f"- Pre-review recruiter readiness: {asset_classification['recruiterReadiness']}\n"
                        f"- User-provided project context: "
                        f"{user_context_description or 'No user-written project description was supplied.'}\n\n"
                        "Use the metadata only as context. Grade the artifact by its intended scope, not by raw "
                        "file size or line count.\n\n"
                        f"Score rubric:\n{AUDIT_SCORE_FIELD_DESCRIPTION}\n\n"
                        "Return only a raw JSON object with ai_summary, score, pros, cons, and recommendations. "
                        "Every pros, cons, and recommendations item MUST use a "
                        "'Catchy Hook: Short explanation' format. NO EXCEPTIONS. "
                        "Every item MUST be under 15 words total. NO ESSAYS. "
                        "Each array must contain at most 4 items.\n\n"
                        "Uploaded Content To Audit:\n"
                        f"{asset_text_content[:24000]}"
                    ),
                },
            ],
            response_format=AUDIT_RESPONSE_FORMAT,
            temperature=0.1,
        )

        audit_response = parse_audit_response(completion.choices[0].message.content, asset_classification)
        audit_payload = audit_response.model_dump()
        calculated_score = audit_response.score
        ai_summary = audit_response.ai_summary
        detected_type = asset_classification["detectedType"]
        language = asset_classification["language"]
        review_mode = asset_classification["reviewMode"]
        complexity_level = asset_classification["complexityLevel"]
        project_depth = asset_classification["projectDepth"]
        recruiter_readiness = asset_classification["recruiterReadiness"]
        strengths = audit_response.strengths
        weaknesses = audit_response.weaknesses
        recommendations = audit_response.recommendations
        update_payload = {
            "score": calculated_score,
            "evaluation_score": calculated_score,
            "logic_score": calculated_score,
            "audit_summary": ai_summary,
            "ai_summary": ai_summary,
            "description": ai_summary,
            "pros": strengths,
            "cons": weaknesses,
            "recommendations": recommendations,
            "user_description": ai_summary,
            "has_been_audited": True,
            "status": "Verified",
        }
        project_payload = None

        if project_id:
            project_id_filter = str(project_id)
            supabase = get_request_supabase_client(request)

            await asyncio.to_thread(
                lambda: supabase.table("projects")
                .update(update_payload)
                .eq("id", project_id_filter)
                .or_(f"user_id.eq.{current_user_id}")
                .execute()
            )

            project_payload = {
                "id": project_id_filter,
                **update_payload,
            }

        response_payload = {
            "success": True,
            "detectedType": detected_type,
            "language": language,
            "reviewMode": review_mode,
            "complexityLevel": complexity_level,
            "projectDepth": project_depth,
            "recruiterReadiness": recruiter_readiness,
            "ai_summary": ai_summary,
            "user_description": ai_summary,
            "executiveSummary": ai_summary,
            "report": {
                **audit_payload,
                "calculatedScore": calculated_score,
                "executiveSummary": ai_summary,
                "pros": strengths,
                "cons": weaknesses,
                "strategicRecommendations": recommendations,
            },
            "score": calculated_score,
            "description": ai_summary,
            "executive_summary": ai_summary,
            "summary": ai_summary,
            "audit_summary": ai_summary,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "pros": strengths,
            "cons": weaknesses,
            "recommendations": recommendations,
        }

        if project_payload is not None:
            response_payload["project"] = project_payload

        return response_payload

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
                chat_stream = sync_client.chat.completions.create(
                    model="gpt-4o-mini",
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
                embedding_response = sync_client.embeddings.create(
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
