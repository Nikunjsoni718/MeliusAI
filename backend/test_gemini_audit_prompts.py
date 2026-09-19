import json
import sys
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, patch


def install_google_genai_test_stub():
    """Allow contract tests to load when the optional Gemini SDK is absent."""
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
    @staticmethod
    def telemetry_payload(*, finding_id="F1", duplicate=False, catastrophic=False):
        finding = {
            "findingId": finding_id,
            "text": "In API route: request.body.email is passed to createUser without validation.",
            "severity": "CRITICAL" if catastrophic else "WARNING",
            "scope": "In API route: user provisioning",
            "location": "app/api/users/route.ts: createUser",
            "isCatastrophic": catastrophic,
        }
        directive = {
            "directiveId": "D1",
            "findingId": finding_id,
            "text": "Add userSchema.parse(request.body) before createUser in app/api/users/route.ts",
        }
        findings = [finding]
        directives = [directive]
        if duplicate:
            findings.append({**finding, "findingId": "F2", "text": f" {finding['text']} "})
            directives.append({**directive, "directiveId": "D2", "findingId": "F2"})
        return {
            "auditSummary": "The production route has a verified validation gap while its service boundary remains isolated.",
            "strengths": ["In app/api/users/route.ts: persistence is delegated through one service boundary."],
            "findings": findings,
            "directives": directives,
        }

    def test_all_model_contracts_use_canonical_telemetry_only(self):
        prompt = main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT
        self.assertIn("objective, evidence-driven Staff Software Engineer", prompt)
        self.assertIn("Hard omission", prompt)
        self.assertIn("source), the file path, and the terminal execution point (sink)", prompt)
        self.assertIn("one finding per unique root cause", prompt)
        self.assertIn("total system compromise or unrecoverable application failure", prompt)
        self.assertIn("all four pillars", prompt)
        self.assertIn("Security", prompt)
        self.assertIn("Reliability and resilience", prompt)
        self.assertIn("Performance and optimization", prompt)
        self.assertIn("Code quality and maintainability", prompt)
        self.assertIn("five strongest verified architectural strengths", prompt)
        self.assertIn("five highest-priority unique findings", prompt)
        self.assertIn("exactly `auditSummary`, `strengths`, `findings`, and `directives`", prompt)
        self.assertNotIn("impactArea", prompt)

        for contract in ("file", "workspace", "standalone", "incremental", "dashboard"):
            with self.subTest(contract=contract):
                rendered = main.build_meliusai_security_audit_prompt(contract)
                self.assertTrue(rendered.startswith(prompt))
                self.assertIn("SCHEMA BINDING", rendered)
                self.assertIn("`auditSummary`", rendered)
                self.assertNotIn("`score_delta`", rendered)
                self.assertNotIn("`impactArea`", rendered)

        file_prompt = main.generate_single_file_audit_prompt(
            asset_name="app/api/users/route.ts",
            asset_text_content="export async function POST() {}",
            asset_classification={
                "detectedType": "code",
                "language": "TypeScript",
                "reviewMode": "engineering",
                "complexityLevel": "standard",
                "projectDepth": "single-file",
                "recruiterReadiness": "not-assessed",
            },
            user_context_description="",
        )
        self.assertIn("five strongest strengths and five highest-priority", file_prompt)

    def test_canonical_telemetry_validates_evidence_and_adapts_legacy_fields(self):
        telemetry = main.AuditTelemetryResponse.model_validate(self.telemetry_payload())
        adapted = main.adapt_audit_telemetry(telemetry)

        self.assertEqual(adapted["summary"], telemetry.auditSummary)
        self.assertEqual(adapted["pros"], [{"text": telemetry.strengths[0]}])
        self.assertEqual(adapted["cons"][0]["scope"], "In API route: user provisioning")
        self.assertEqual(adapted["cons"][0]["location"], "app/api/users/route.ts: createUser")
        self.assertEqual(adapted["recommendations"][0]["directiveId"], "D1")
        self.assertNotIn("impactArea", adapted["recommendations"][0])

    def test_canonical_telemetry_rejects_generic_or_unlinked_output(self):
        generic = self.telemetry_payload()
        generic["findings"][0]["text"] = "Sanitize inputs"
        with self.assertRaises(main.ValidationError):
            main.AuditTelemetryResponse.model_validate(generic)

        generic_directive = self.telemetry_payload()
        generic_directive["directives"][0]["text"] = "Use best practices"
        with self.assertRaises(main.ValidationError):
            main.AuditTelemetryResponse.model_validate(generic_directive)

        missing_directive = self.telemetry_payload()
        missing_directive["directives"] = []
        with self.assertRaises(main.ValidationError):
            main.AuditTelemetryResponse.model_validate(missing_directive)

        orphan_directive = self.telemetry_payload()
        orphan_directive["directives"][0]["findingId"] = "missing"
        with self.assertRaises(main.ValidationError):
            main.AuditTelemetryResponse.model_validate(orphan_directive)

    def test_exact_duplicate_root_causes_collapse_before_scoring(self):
        telemetry = main.AuditTelemetryResponse.model_validate(self.telemetry_payload(duplicate=True))
        self.assertEqual(len(telemetry.findings), 1)
        self.assertEqual(len(telemetry.directives), 1)
        self.assertEqual(telemetry.directives[0].findingId, "F1")
        adapted = main.adapt_audit_telemetry(telemetry)
        impacts = main.build_finding_impacts(adapted["pros"], adapted["cons"], adapted["recommendations"])
        self.assertEqual(main.calculate_audit_score(impacts), 93)

    def test_telemetry_keeps_five_ranked_findings_and_only_their_directives(self):
        payload = self.telemetry_payload()
        payload["strengths"] = [
            f"In app/service{index}.ts: service {index} uses one verified boundary."
            for index in range(6)
        ]
        payload["findings"] = [
            {
                "findingId": "F1",
                "text": "In cache layer: redundant refreshLoop performs duplicate work.",
                "severity": "OPTIMIZATION",
                "scope": "In cache layer: refresh scheduling",
                "location": "app/cache.ts: refreshLoop",
                "isCatastrophic": False,
            },
            {
                "findingId": "F2",
                "text": "In API route: request.body.token reaches verifyToken without a missing-token branch.",
                "severity": "WARNING",
                "scope": "In API route: token validation",
                "location": "app/token.ts: verifyToken",
                "isCatastrophic": False,
            },
            {
                "findingId": "F3",
                "text": "In billing route: request.body.accountId reaches chargeAccount without an ownership branch.",
                "severity": "CRITICAL",
                "scope": "In billing route: account authorization",
                "location": "app/billing.ts: chargeAccount",
                "isCatastrophic": False,
            },
            {
                "findingId": "F4",
                "text": "Across cache workers: redundant cache refresh runs after every request.",
                "severity": "OPTIMIZATION",
                "scope": "Across cache workers: refresh scheduling",
                "location": "app/cache-worker.ts: refreshCache",
                "isCatastrophic": False,
            },
            {
                "findingId": "F5",
                "text": "Across API endpoints: request.body.email reaches createUser without validation.",
                "severity": "WARNING",
                "scope": "Across API endpoints: request validation",
                "location": "app/users.ts: createUser",
                "isCatastrophic": False,
            },
            {
                "findingId": "F6",
                "text": "Across API endpoints: request.body.userId reaches deleteAccount without an ownership branch.",
                "severity": "CRITICAL",
                "scope": "Across API endpoints: account authorization",
                "location": "app/accounts.ts: deleteAccount",
                "isCatastrophic": False,
            },
        ]
        payload["directives"] = [
            {
                "directiveId": f"D{index}",
                "findingId": f"F{index}",
                "text": f"Add guard{index}(request.body) in app/finding{index}.ts",
            }
            for index in range(1, 7)
        ]

        telemetry = main.AuditTelemetryResponse.model_validate(payload)

        self.assertEqual(len(telemetry.strengths), 5)
        self.assertEqual(
            [finding.findingId for finding in telemetry.findings],
            ["F6", "F3", "F5", "F2", "F4"],
        )
        self.assertEqual(
            {directive.findingId for directive in telemetry.directives},
            {"F2", "F3", "F4", "F5", "F6"},
        )

    def test_scores_follow_98_12_5_1_with_the_soft_floor_and_catastrophic_gate(self):
        self.assertEqual(main.calculate_audit_score({"pros": [], "cons": [], "recommendations": []}), 98)
        self.assertEqual(
            main.calculate_audit_score({
                "pros": [],
                "cons": [{"findingId": "F1", "text": "In cache layer: redundant cache refresh runs.", "severity": "OPTIMIZATION"}],
                "recommendations": [],
            }),
            97,
        )
        self.assertEqual(
            main.calculate_audit_score({
                "pros": [],
                "cons": [{"findingId": "F1", "text": "In API route: request.body.email is passed to createUser without validation.", "severity": "WARNING"}],
                "recommendations": [],
            }),
            93,
        )
        ordinary_critical = [{
            "findingId": f"F{index}",
            "text": f"In API route: request.body.value is passed to handler {index} without validation.",
            "severity": "CRITICAL",
            "isCatastrophic": True,
        } for index in range(20)]
        self.assertEqual(main.calculate_audit_score({"pros": [], "cons": ordinary_critical, "recommendations": []}), 25)
        catastrophic = [{
            "findingId": "F1",
            "text": "Total system compromise: production accepts arbitrary administrator creation.",
            "severity": "CRITICAL",
            "isCatastrophic": True,
        }]
        self.assertEqual(main.calculate_audit_score({"pros": [], "cons": catastrophic, "recommendations": []}), 24)

    async def test_test_assets_are_omitted_before_native_or_model_audit(self):
        generate_audit = AsyncMock()
        with patch.object(main.NativeCodeParser, "parse") as native_parse, patch.object(
            main, "generate_gemini_structured_audit", generate_audit
        ):
            result = await main.perform_ai_file_audit(
                filename="src/auth.spec.ts",
                content='const password = "dummy-secret";',
                detected_language="TypeScript",
            )

        native_parse.assert_not_called()
        generate_audit.assert_not_awaited()
        self.assertEqual(result["evaluated_score"], 98)
        self.assertEqual(result["cons"], [])
        self.assertEqual(result["recommendations"], [])
        self.assertNotIn("dummy-secret", json.dumps(result))

    async def test_file_audit_adapts_canonical_model_response_before_scoring(self):
        telemetry = main.AuditTelemetryResponse.model_validate(self.telemetry_payload())
        with patch.object(main.NativeCodeParser, "parse", return_value={
            "imports_or_dependencies": [],
            "detected_functions": [],
            "hardcoded_secrets_detected": False,
            "lines_of_code": 3,
        }), patch.object(
            main, "generate_gemini_structured_audit", AsyncMock(return_value=telemetry)
        ) as generate_audit:
            result = await main.perform_ai_file_audit(
                filename="app/api/users/route.ts",
                content="export async function POST() {}",
                detected_language="TypeScript",
            )

        self.assertEqual(result["evaluated_score"], 93)
        self.assertEqual(result["cons"], [telemetry.findings[0].text])
        self.assertEqual(result["finding_impacts"]["recommendations"][0]["directiveId"], "D1")
        self.assertIn("auditSummary", generate_audit.await_args.args[1])

    def test_incremental_adapter_derives_changed_file_counts_without_model_impacts(self):
        telemetry = main.AuditTelemetryResponse.model_validate(self.telemetry_payload())
        report = main.adapt_telemetry_to_incremental_report(
            telemetry,
            ["app/api/users/route.ts", "lib/users.ts"],
        )
        self.assertEqual([item.file_path for item in report.file_impacts], ["app/api/users/route.ts", "lib/users.ts"])
        self.assertEqual([item.verdict.value for item in report.file_impacts], ["NEUTRAL", "NEUTRAL"])
        self.assertEqual(report.new_vulnerabilities, [])
        self.assertEqual(report.resolved_issues, [])


if __name__ == "__main__":
    unittest.main()
