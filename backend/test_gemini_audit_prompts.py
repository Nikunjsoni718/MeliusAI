import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
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
            "file": ("description", "delta_summary", "pros", "cons", "recommendations"),
            "workspace": (
                "executive_summary",
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
                "deductions",
            ),
            "incremental": (
                "file_impacts",
                "new_vulnerabilities",
                "resolved_issues",
                "updated_architecture_summary",
                "pros",
                "cons",
                "recommendations",
            ),
            "dashboard": ("ai_summary", "strengths", "weaknesses", "recommendations"),
        }

        self.assertIn("System Design & Architecture (30%)", main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT)
        self.assertIn("Never output a single-digit score.", main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT)
        self.assertIn("15/100 is the absolute minimum score.", main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT)
        self.assertIn("Assume every codebase starts with a perfect score of 100/100.", main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT)
        self.assertIn("impactScore", main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT)

        for contract, keys in expected_keys.items():
            with self.subTest(contract=contract):
                prompt = main.build_meliusai_security_audit_prompt(contract)
                self.assertTrue(prompt.startswith(main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT))
                self.assertIn("System Design & Architecture (30%)", prompt)
                self.assertIn("No Automatic Failures", prompt)
                self.assertIn("fragment after its hook is ten words or", prompt)
                self.assertIn("Catchy Hook: Short fragment", prompt)
                self.assertIn("SCHEMA BINDING", prompt)
                for key in keys:
                    self.assertIn(f"`{key}`", prompt)

    def test_score_floor_clamps_parseable_model_and_calculated_scores(self):
        self.assertEqual(main.coerce_audit_score(0), 15)
        self.assertEqual(main.coerce_audit_score("9"), 15)
        self.assertEqual(main.coerce_audit_score(101), 100)
        self.assertEqual(main.coerce_audit_score(None), 0)
        self.assertEqual(
            main.calculate_audit_score(
                {
                    "pros": [],
                    "cons": [
                        {"deductionId": "D1", "text": "Critical One: First severe weakness.", "impactScore": -20},
                        {"deductionId": "D2", "text": "Critical Two: Second severe weakness.", "impactScore": -20},
                        {"deductionId": "D3", "text": "Critical Three: Third severe weakness.", "impactScore": -20},
                        {"deductionId": "D4", "text": "Critical Four: Fourth severe weakness.", "impactScore": -20},
                        {"deductionId": "D5", "text": "Critical Five: Fifth severe weakness.", "impactScore": -20},
                    ],
                }
            ),
            15,
        )
        self.assertEqual(main.calculate_audit_score({"pros": [{"text": "Passed: Typed boundary is present."}], "cons": []}), 100)
        self.assertEqual(
            main.calculate_audit_score({"pros": [], "cons": [{"deductionId": "D1", "text": "Input Gap: Validation is missing.", "impactScore": -12}]}),
            88,
        )
        normalized = main.normalize_agentic_audit_report(
            {"score": 7, "executive_summary": "The code parses but needs fundamental remediation."},
            "Fallback summary.",
        )
        self.assertEqual(normalized["evaluated_score"], 15)
        deduction_normalized = main.normalize_agentic_audit_report(
            {
                "score": 7,
                "executive_summary": "The code has one confirmed validation issue.",
                "deductions": [
                    {"deductionId": "D1", "text": "Input Gap: Validation is missing.", "impactScore": -12}
                ],
            },
            "Fallback summary.",
        )
        self.assertEqual(deduction_normalized["evaluated_score"], 88)

    async def test_file_audit_keeps_balanced_score_for_native_security_findings(self):
        balanced_response = main.FileAuditResponse(
            description="The component has clean boundaries with one exposed credential to remediate.",
            delta_summary="The architecture and state boundaries improved despite the remaining credential exposure.",
            pros=[{"text": "Clear Boundary: Typed API service isolates access."}],
            cons=[{"deductionId": "D1", "text": "Secret Exposure: client contains a hardcoded credential.", "impactScore": -17}],
            recommendations=[{"deductionId": "D1", "text": "Move Secret: Read credentials from server-side environment."}],
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

        self.assertEqual(result["evaluated_score"], 83)
        self.assertEqual(result["score_delta"], 8)
        self.assertEqual(result["cons"], ["Secret Exposure: client contains a hardcoded credential."])
        self.assertEqual(result["finding_impacts"]["pros"], [{"text": "Clear Boundary: Typed API service isolates access."}])
        self.assertEqual(result["finding_impacts"]["recommendations"][0]["deductionId"], "D1")
        rendered_prompt = generate_audit.await_args.args[1]
        self.assertIn("The previous file score was 75/100.", rendered_prompt)
        self.assertIn("The backend starts the new audit at 100", rendered_prompt)
        self.assertNotIn("Return score, score_delta", rendered_prompt)

    def test_backend_rejects_scored_highlights_and_invalid_deduction_links(self):
        with self.assertRaises(ValueError):
            main.build_finding_impacts(
                [{"text": "Invalid Strength: Highlights cannot carry points.", "impactScore": 1}],
                [],
                [],
            )

        with self.assertRaises(ValueError):
            main.build_finding_impacts(
                [],
                [{"deductionId": "D1", "text": "Invalid Deduction: Positive points are not allowed.", "impactScore": 1}],
                [{"deductionId": "D1", "text": "Fix It: Remove the invalid positive deduction."}],
            )

        with self.assertRaises(ValueError):
            main.build_finding_impacts(
                [],
                [{"deductionId": "D1", "text": "Input Gap: Validation is missing.", "impactScore": -8}],
                [{"deductionId": "D1", "text": "Validate Input: Reject malformed values.", "impactScore": 5}],
            )

        with self.assertRaises(ValueError):
            main.build_finding_impacts(
                [],
                [{"deductionId": "D1", "text": "Input Gap: Validation is missing.", "impactScore": -8}],
                [{"deductionId": "D2", "text": "Validate Input: Reject malformed values."}],
            )

    async def test_mocked_gemini_responses_validate_existing_structured_contracts(self):
        payloads = (
            (
                main.FileAuditResponse,
                {
                    "description": "The file has a clear boundary but needs stronger input validation.",
                    "delta_summary": "Input validation improved without changing the overall architecture.",
                    "pros": [{"text": "Clear Boundary: Parsing is isolated from persistence."}],
                    "cons": [{"deductionId": "D1", "text": "Validation Gap: External input remains insufficiently constrained.", "impactScore": -9}],
                    "recommendations": [{"deductionId": "D1", "text": "Validate Inputs: Reject malformed values before processing."}],
                },
                "file",
            ),
            (
                main.FolderAuditResponse,
                {
                    "delta_summary": "The workspace now separates API ownership checks from presentation logic.",
                    "executive_summary": "The workspace is close to production-ready with targeted security work remaining.",
                    "pros": [{"text": "Clean Boundaries: API and UI responsibilities are separated."}],
                    "cons": [{"deductionId": "D1", "text": "Rate Limit Gap: Public mutations lack throttling.", "impactScore": -10}],
                    "recommendations": [{"deductionId": "D1", "text": "Add Limits: Apply route-level quotas before deployment."}],
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
                    "deductions": [{"deductionId": "D1", "text": "Input Gap: Caller-supplied URLs are not constrained.", "impactScore": -8}],
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
            "pros": [{"text": "Existing Strength: Input validation remains intact."}],
            "cons": [{"deductionId": "D1", "text": "Authorization Regression: Mutation path lacks an authorization check.", "impactScore": -14}],
            "recommendations": [{"deductionId": "D1", "text": "Restore Authorization: Check ownership before mutation."}],
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
                    "pros": ["Existing Strength: Input validation remains intact."],
                    "cons": ["Existing Weakness: Cache invalidation is incomplete."],
                    "recommendations": ["Existing Recommendation: Add cache invalidation tests."],
                    "finding_impacts": {
                        "pros": [{"text": "Existing Strength: Input validation remains intact.", "impactScore": 10}],
                        "cons": [{"text": "Existing Weakness: Cache invalidation is incomplete.", "impactScore": -8}],
                        "recommendations": [{"text": "Existing Recommendation: Add cache invalidation tests.", "impactScore": 8}],
                    },
                },
                "test-api-key",
            )

        self.assertEqual(incremental.model_dump(), incremental_payload)
        self.assertTrue(
            captured_incremental_request["contents"].startswith(
                main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT
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
        self.assertIn("Do not drop historical items", prompt)
        self.assertIn("because they are absent from the narrow diff.", prompt)
        self.assertIn("must evaluate the ENTIRE repository's", prompt)
        self.assertIn("Existing Strength: Input validation remains intact.", captured_incremental_request["contents"])
        self.assertNotIn("{diff_payload}", captured_incremental_request["contents"])
        self.assertNotIn("{previous_report_payload}", captured_incremental_request["contents"])

    @staticmethod
    def _mock_generate_content(payload):
        async def generate_content(**_kwargs):
            return SimpleNamespace(parsed=payload, text="")

        return generate_content


if __name__ == "__main__":
    unittest.main()
