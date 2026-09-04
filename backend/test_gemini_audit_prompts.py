import unittest
from types import SimpleNamespace
from unittest.mock import patch
import sys
from types import ModuleType


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
            ),
            "dashboard": ("ai_summary", "score", "score_reasoning", "strengths", "weaknesses", "recommendations"),
        }

        for contract, keys in expected_keys.items():
            with self.subTest(contract=contract):
                prompt = main.build_meliusai_security_audit_prompt(contract)
                self.assertIn("MeliusAI, an expert Application Security Architect", prompt)
                self.assertIn('algorithms=["HS256"]', prompt)
                self.assertIn(".limit().offset()", prompt)
                self.assertIn("SCHEMA BINDING", prompt)
                for key in keys:
                    self.assertIn(f"`{key}`", prompt)

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
        }
        captured_incremental_request = {}

        def generate_incremental_content(**kwargs):
            captured_incremental_request.update(kwargs)
            return SimpleNamespace(parsed=incremental_payload, text="")

        fake_incremental_client = SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_incremental_content)
        )
        with patch.object(main.genai, "Client", return_value=fake_incremental_client):
            incremental = main.run_incremental_audit(
                {"backend/main.py": "+ unsafe authorization change"},
                {"score": 76, "recommendations": []},
                "test-api-key",
            )

        self.assertEqual(incremental.model_dump(), incremental_payload)
        self.assertIn(
            "MeliusAI, an expert Application Security Architect",
            captured_incremental_request["contents"],
        )
        self.assertIn("SCHEMA BINDING", captured_incremental_request["contents"])

    @staticmethod
    def _mock_generate_content(payload):
        async def generate_content(**_kwargs):
            return SimpleNamespace(parsed=payload, text="")

        return generate_content


if __name__ == "__main__":
    unittest.main()
