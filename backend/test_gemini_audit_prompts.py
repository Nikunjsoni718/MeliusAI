import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import sys
from types import ModuleType


UNIVERSAL_PROJECT_AUDITOR_PROMPT = """You are MeliusAI, an expert Principal Systems Architect and a supportive, highly experienced Tech Lead. Your goal is to audit the provided codebase as a universal project evaluator. You must assess system design, architectural cohesion, code quality, and security as a unified ecosystem.

### 1. Tone & Persona
- Speak like a friendly, insightful mentor. Be conversational, direct, and human—neither overly robotic nor casually unprofessional.
- Communicate with genuine excitement for good architecture and clean code. Frame weaknesses as great opportunities to level-up.
- Be rigorous in your standards, but supportive and accessible in your delivery.

### 2. The Four Pillars of Universal Auditing
Evaluate the codebase holistically across these four areas. Do not let a flaw in one pillar completely blind you to the strengths in the others.
* **System Design & Architecture (30%):** Evaluate the separation of concerns, design patterns (e.g., MVC, Repository, Services), and state management. Does the architecture make sense for the chosen stack? Are business logic, routing, and data layers properly decoupled?
* **Cross-File Cohesion & Data Flow (30%):** Analyze how modules interact. Are dependencies clean? Does data flow logically between the frontend/backend or across microservices? Look for systemic bottlenecks, circular logic, or fragile integrations.
* **Code Quality & Sanitation (20%):** Assess maintainability, DRY principles, and readability. Look for robust input sanitation, graceful error handling, and proper typing/interfaces.
* **Security & Robustness (20%):** Check for OWASP Top 10 vulnerabilities (BOLA, injection, broken auth), hardcoded secrets, concurrency race conditions, and unbounded resource consumption.

### 3. Scope & Evaluation Boundaries
- **Stack-Agnostic Ecosystems:** Evaluate the actual tech stack present. Do not penalize backend code for missing UI layers, and do not penalize frontend code for missing database layers.
- **Explicit Anchoring:** Anchor every strength and weakness to a specific file path and function/component (e.g., "In `services/user.ts:fetchUser`...").
- **Systemic Focus:** Ignore trivial variable naming, basic formatting, or missing READMEs. Focus on the engineering skeleton.

### 4. Scoring Rubric
- Base your score (0-100) on a balanced evaluation of the Four Pillars.
- **No Automatic Failures:** A brilliantly architected system that contains a hardcoded secret should take a heavy security penalty (e.g., -15 to -20 points), but it should NOT automatically drop to a 0-24 score if the architecture and code quality are otherwise flawless.
- **Scoring Ranges:** 90-100 (Enterprise Ready), 75-89 (Solid Foundation), 50-74 (Needs Structural Refactoring), 25-49 (Critical Systemic Flaws), 0-24 (Fundamental Engineering Failure).
- **Incremental Delta:** The previous audit score was {previous_score}/100. Calculate `score_delta` (new score minus previous score) based purely on concrete code improvements or regressions.

### 5. Output Formatting (Strict JSON)
Return a valid JSON object exactly matching this schema. For arrays, you MUST use the exact format: "Catchy Hook: Short fragment".
CRITICAL LIMIT: The explanation fragment MUST be 10 words or less. DO NOT write full sentences. Use punchy, actionable fragments. NO ESSAYS.

{
  "score": <integer 0-100>,
  "score_delta": <integer>,
  "delta_summary": "<One concise sentence explaining exactly what changed since the last audit>",
  "summary": "<2-3 sentence executive assessment of overall architecture, design, and health in a conversational Tech Lead tone>",
  "strengths": [
    "<Catchy Hook>: <Short fragment anchored to a file, max 10 words.>"
  ],
  "weaknesses": [
    "<Catchy Hook>: <Short vulnerability fragment anchored to a file, max 10 words.>"
  ],
  "recommendations": [
    "<Catchy Hook>: <Exact inline code or architecture fix, max 10 words.>"
  ]
}"""


def install_google_genai_test_stub():
    """Allow prompt-contract tests to run when only the optional Gemini SDK is absent."""
    google_module = ModuleType("google")
    genai_module = ModuleType("google.genai")
    types_module = ModuleType("google.genai.types")

    class GenerateContentConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class Client:
        def __init__(self, *_args, **_kwargs):
            self.aio = SimpleNamespace(models=SimpleNamespace())
            self.models = SimpleNamespace()

    genai_module.Client = Client
    genai_module.types = types_module
    types_module.GenerateContentConfig = GenerateContentConfig
    google_module.genai = genai_module
    sys.modules["google"] = google_module
    sys.modules["google.genai"] = genai_module
    sys.modules["google.genai.types"] = types_module

try:
    from backend import main
except ModuleNotFoundError as error:
    if error.name == "google":
        install_google_genai_test_stub()
        try:
            from backend import main
        except ModuleNotFoundError as retry_error:
            main = None
            BACKEND_IMPORT_ERROR = str(retry_error)
        else:
            BACKEND_IMPORT_ERROR = ""
    else:
        main = None
        BACKEND_IMPORT_ERROR = str(error)
else:
    BACKEND_IMPORT_ERROR = ""


@unittest.skipIf(main is None, f"Backend dependencies are unavailable: {BACKEND_IMPORT_ERROR}")
class GeminiAuditPromptTests(unittest.IsolatedAsyncioTestCase):
    def test_shared_persona_and_schema_bindings_cover_every_audit_contract(self):
        expected_keys = {
            "file": ("description", "score", "score_delta", "delta_summary", "pros", "cons", "recommendations"),
            "workspace": (
                "executive_summary",
                "score",
                "score_delta",
                "delta_summary",
                "pros",
                "cons",
                "recommendations",
            ),
            "standalone": (
                "executive_summary",
                "goods_and_strengths",
                "bads_and_flaws",
                "strategic_recommendations",
                "overall_score",
            ),
            "incremental": (
                "candidate_score_delta",
                "new_score",
                "file_impacts",
                "new_vulnerabilities",
                "resolved_issues",
                "updated_architecture_summary",
                "pros",
                "cons",
                "recommendations",
            ),
            "dashboard": ("ai_summary", "score", "score_reasoning", "strengths", "weaknesses", "recommendations"),
        }

        self.assertEqual(
            main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT,
            UNIVERSAL_PROJECT_AUDITOR_PROMPT,
        )

        for contract, keys in expected_keys.items():
            with self.subTest(contract=contract):
                prompt = main.build_meliusai_security_audit_prompt(contract)
                self.assertTrue(prompt.startswith(UNIVERSAL_PROJECT_AUDITOR_PROMPT))
                self.assertIn("System Design & Architecture (30%)", prompt)
                self.assertIn("No Automatic Failures", prompt)
                self.assertIn("CRITICAL LIMIT: The explanation fragment MUST be 10 words or less.", prompt)
                self.assertIn("Catchy Hook: Short fragment", prompt)
                self.assertIn("SCHEMA BINDING", prompt)
                for key in keys:
                    self.assertIn(f"`{key}`", prompt)

    async def test_file_audit_keeps_balanced_score_for_native_security_findings(self):
        balanced_response = main.FileAuditResponse(
            description="The component has clean boundaries with one exposed credential to remediate.",
            score=91,
            score_delta=16,
            delta_summary="The architecture and state boundaries improved despite the remaining credential exposure.",
            pros=["Clear Boundary: API access is isolated behind a typed service."],
            cons=["Secret Exposure: backend/client.ts contains a hardcoded credential."],
            recommendations=["Move Secret: Read the credential from a server-side environment variable."],
        )
        native_analysis = {
            "imports_or_dependencies": [],
            "detected_functions": [],
            "hardcoded_secrets_detected": True,
            "lines_of_code": 12,
        }

        with (
            patch.object(main.NativeCodeParser, "parse", return_value=native_analysis),
            patch.object(
                main,
                "generate_gemini_structured_audit",
                AsyncMock(return_value=balanced_response),
            ) as generate_audit,
        ):
            result = await main.perform_ai_file_audit(
                filename="components/account.tsx",
                content='const token = "secret"; element.innerHTML = userContent;',
                detected_language="TypeScript",
                previous_score=75,
            )

        self.assertEqual(result["evaluated_score"], 91)
        self.assertEqual(result["score_delta"], 16)
        self.assertEqual(result["cons"], balanced_response.cons)
        rendered_prompt = generate_audit.await_args.args[1]
        self.assertIn("The previous audit score was 75/100.", rendered_prompt)
        self.assertNotIn("{previous_score}", rendered_prompt)

    async def test_mocked_gemini_responses_validate_existing_structured_contracts(self):
        payloads = (
            (
                main.FileAuditResponse,
                {
                    "description": "The file has a clear boundary but needs stronger input validation.",
                    "score": 78,
                    "score_delta": 4,
                    "delta_summary": "Input validation improved without changing the overall architecture.",
                    "pros": ["Clear Boundary: Parsing is isolated from persistence."],
                    "cons": ["Validation Gap: External input remains insufficiently constrained."],
                    "recommendations": ["Validate Inputs: Reject malformed values before processing."],
                },
                "file",
            ),
            (
                main.FolderAuditResponse,
                {
                    "score": 81,
                    "score_delta": 6,
                    "delta_summary": "The workspace now separates API ownership checks from presentation logic.",
                    "executive_summary": "The workspace is close to production-ready with targeted security work remaining.",
                    "pros": ["Clean Boundaries: API and UI responsibilities are separated."],
                    "cons": ["Rate Limit Gap: Public mutation routes lack request throttling."],
                    "recommendations": ["Add Limits: Apply route-level request quotas before deployment."],
                },
                "workspace",
            ),
            (
                main.AnalyzeCodeResponse,
                {
                    "executive_summary": "The TypeScript asset has a readable data flow and a few validation gaps.",
                    "goods_and_strengths": ["Typed Boundary: Request data is normalized before use."],
                    "bads_and_flaws": ["Input Gap: Caller-supplied URLs are not constrained."],
                    "strategic_recommendations": ["Validate URLs: Restrict outbound targets to trusted hosts."],
                    "overall_score": 76,
                },
                "standalone",
            ),
        )

        for response_schema, payload, contract in payloads:
            with self.subTest(contract=contract):
                fake_models = SimpleNamespace(
                    generate_content=self._mock_generate_content(payload)
                )
                fake_client = SimpleNamespace(aio=SimpleNamespace(models=fake_models))
                with patch.object(main, "gemini_client", fake_client):
                    result = await main.generate_gemini_structured_audit(
                        response_schema,
                        main.build_meliusai_security_audit_prompt(contract),
                    )

                self.assertIsInstance(result, response_schema)
                self.assertEqual(result.model_dump(), payload)

        incremental_payload = {
            "candidate_score_delta": -3,
            "new_score": 73,
            "file_impacts": [
                {
                    "file_path": "backend/main.py",
                    "verdict": "DEGRADED",
                    "summary": "An authorization check was removed from a mutation path.",
                }
            ],
            "new_vulnerabilities": ["Authorization regression in the mutation path."],
            "resolved_issues": [],
            "updated_architecture_summary": "The change introduces an authorization regression.",
            "pros": ["Existing strength: Input validation remains intact."],
            "cons": ["Authorization regression in the mutation path."],
            "recommendations": ["Restore authorization checks before mutation."],
        }
        captured_incremental_request = {}

        def generate_incremental_content(**kwargs):
            captured_incremental_request.update(kwargs)
            return SimpleNamespace(parsed=incremental_payload, text="")

        fake_incremental_client = SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_incremental_content),
            close=lambda: None,
        )
        with patch.object(main.genai, "Client", return_value=fake_incremental_client):
            incremental = main.run_incremental_audit(
                {"backend/main.py": "+ unsafe authorization change"},
                {
                    "score": 76,
                    "pros": ["Existing strength: Input validation remains intact."],
                    "cons": ["Existing weakness: Cache invalidation is incomplete."],
                    "recommendations": ["Existing recommendation: Add cache invalidation tests."],
                },
                "test-api-key",
            )

        self.assertEqual(incremental.model_dump(), incremental_payload)
        self.assertTrue(
            captured_incremental_request["contents"].startswith(
                UNIVERSAL_PROJECT_AUDITOR_PROMPT
            )
        )
        self.assertIn("SCHEMA BINDING", captured_incremental_request["contents"])
        self.assertIn("+ unsafe authorization change", captured_incremental_request["contents"])
        self.assertIn('"score": 76', captured_incremental_request["contents"])
        prompt = captured_incremental_request["contents"]
        self.assertIn("Your task is to UPDATE", prompt)
        self.assertIn("1. COPY FIRST", prompt)
        self.assertIn("2. EVALUATE THE DELTA", prompt)
        self.assertIn("3. REMOVE/MODIFY", prompt)
        self.assertIn("4. APPEND", prompt)
        self.assertIn("5. HOLISTIC SUMMARY", prompt)
        self.assertLess(prompt.index("1. COPY FIRST"), prompt.index("2. EVALUATE THE DELTA"))
        self.assertLess(prompt.index("2. EVALUATE THE DELTA"), prompt.index("3. REMOVE/MODIFY"))
        self.assertLess(prompt.index("3. REMOVE/MODIFY"), prompt.index("4. APPEND"))
        self.assertLess(prompt.index("4. APPEND"), prompt.index("5. HOLISTIC SUMMARY"))
        self.assertIn("Do not drop historical items because they are absent from the narrow diff.", prompt)
        self.assertIn("must evaluate the ENTIRE repository's", prompt)
        self.assertIn("Existing strength: Input validation remains intact.", captured_incremental_request["contents"])
        self.assertNotIn("{diff_payload}", captured_incremental_request["contents"])
        self.assertNotIn("{previous_report_payload}", captured_incremental_request["contents"])

    @staticmethod
    def _mock_generate_content(payload):
        async def generate_content(**_kwargs):
            return SimpleNamespace(parsed=payload, text="")

        return generate_content


if __name__ == "__main__":
    unittest.main()
