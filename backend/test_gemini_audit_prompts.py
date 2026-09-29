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
            "severityTier": "critical" if catastrophic else "medium",
            "penalty": 12 if catastrophic else 5,
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

    def test_all_model_contracts_use_the_exact_security_mentor_instruction(self):
        prompt = main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT
        self.assertTrue(prompt.startswith("You are an elite, industry-leading Senior Security Architect"))
        self.assertIn("supportive, constructive, and highly professional", prompt)
        self.assertIn("EXHAUSTIVE ANALYSIS", prompt)
        self.assertIn("ROOT CAUSE & REAL-WORLD BLAST RADIUS", prompt)
        self.assertIn("ABSOLUTE EXCLUSIVITY", prompt)
        self.assertIn("NO NUMERICAL RATINGS IN TEXT", prompt)
        self.assertIn("SEVERITY CLASSIFICATION CRITERIA", prompt)
        self.assertIn("`pros`", prompt)
        self.assertIn("`weaknesses`", prompt)
        self.assertIn("`recommendations`", prompt)
        self.assertIn("`severity`, `title`, `root_cause`, and `file_path`", prompt)
        self.assertNotIn("Top 5", prompt)
        self.assertNotIn("return 5", prompt.lower())
        self.assertNotIn("penalty", prompt.lower())

        finding_schema = main.AuditTelemetryResponse.model_json_schema()["$defs"]["AuditTelemetryFinding"]
        self.assertIn("severityTier", finding_schema["properties"])
        self.assertNotIn("severityTier", finding_schema["required"])
        provider_schema = main.GeminiAuditResponse.model_json_schema()
        self.assertEqual(set(provider_schema["properties"]), {"pros", "weaknesses", "recommendations"})
        provider_weakness = provider_schema["$defs"]["GeminiAuditWeakness"]
        self.assertEqual(
            set(provider_weakness["properties"]),
            {"severity", "title", "root_cause", "file_path"},
        )

        for contract in ("file", "workspace", "standalone", "incremental", "dashboard"):
            with self.subTest(contract=contract):
                self.assertEqual(main.build_meliusai_security_audit_prompt(contract, "ignored"), prompt)

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
        self.assertIn("lowercase `severity`, `title`, `root_cause`, and `file_path`", file_prompt)
        self.assertIn("returning every", file_prompt)
        self.assertNotIn("Top 5", file_prompt)
        self.assertNotIn("required `penalty` field", file_prompt)

    def test_canonical_telemetry_validates_evidence_and_adapts_legacy_fields(self):
        telemetry = main.AuditTelemetryResponse.model_validate(self.telemetry_payload())
        adapted = main.adapt_audit_telemetry(telemetry)

        self.assertEqual(adapted["summary"], telemetry.auditSummary)
        self.assertEqual(adapted["pros"], [{"text": telemetry.strengths[0]}])
        self.assertEqual(adapted["cons"][0]["scope"], "In API route: user provisioning")
        self.assertEqual(adapted["cons"][0]["location"], "app/api/users/route.ts: createUser")
        self.assertEqual(adapted["cons"][0]["severityTier"], "medium")
        self.assertEqual(adapted["cons"][0]["penalty"], 5)
        self.assertEqual(adapted["recommendations"][0]["directiveId"], "D1")
        self.assertNotIn("impactArea", adapted["recommendations"][0])

    def test_canonical_telemetry_normalizes_minor_model_formatting(self):
        telemetry = main.AuditTelemetryResponse.model_validate({
            "summary": "The production route has one verified validation concern.",
            "pros": [{"description": "The route delegates persistence to a focused service."}],
            "weaknesses": [{
                "id": "finding-1",
                "description": "Sanitize inputs",
                "level": "warning",
                "area": "API route",
                "file": "users route",
            }],
            "recommendations": [{
                "id": "directive-1",
                "finding_id": "finding-1",
                "recommendation": "Use the route validation helper before saving the request.",
            }],
            "score": 100,
        })

        self.assertEqual(telemetry.findings[0].findingId, "finding-1")
        self.assertEqual(telemetry.findings[0].location, "users route")
        self.assertGreater(len(telemetry.findings[0].text), 10)
        self.assertEqual(telemetry.findings[0].severityTier, "medium")
        self.assertEqual(telemetry.findings[0].penalty, 5)
        self.assertEqual(telemetry.directives[0].findingId, "finding-1")
        self.assertIn("validation helper", telemetry.directives[0].text)

        missing_directive = self.telemetry_payload()
        missing_directive["directives"] = []
        normalized_missing_directive = main.AuditTelemetryResponse.model_validate(missing_directive)
        self.assertEqual(len(normalized_missing_directive.directives), 1)
        self.assertEqual(normalized_missing_directive.directives[0].findingId, "F1")

        test_only = self.telemetry_payload()
        test_only["findings"][0]["location"] = "src/users.spec.ts: test validation"
        test_only["directives"][0]["text"] = "Update src/users.spec.ts before retrying the fixture."
        normalized_test_only = main.AuditTelemetryResponse.model_validate(test_only)
        self.assertEqual(normalized_test_only.findings, [])
        self.assertEqual(normalized_test_only.directives, [])

    def test_exact_duplicate_root_causes_collapse_before_scoring(self):
        telemetry = main.AuditTelemetryResponse.model_validate(self.telemetry_payload(duplicate=True))
        self.assertEqual(len(telemetry.findings), 1)
        self.assertEqual(len(telemetry.directives), 1)
        self.assertEqual(telemetry.directives[0].findingId, "F1")
        adapted = main.adapt_audit_telemetry(telemetry)
        impacts = main.build_finding_impacts(adapted["pros"], adapted["cons"], adapted["recommendations"])
        self.assertEqual(main.calculate_audit_score(impacts), 95)

    def test_telemetry_preserves_every_ranked_finding_and_directive(self):
        payload = self.telemetry_payload()
        payload["strengths"] = [
            f"In app/service{index}.ts: service {index} uses one verified boundary."
            for index in range(6)
        ]
        payload["findings"] = [
            {
                "findingId": "F1",
                "text": "In cache layer: redundant refreshLoop performs duplicate work.",
                "severityTier": "low",
                "scope": "In cache layer: refresh scheduling",
                "location": "app/cache.ts: refreshLoop",
                "isCatastrophic": False,
            },
            {
                "findingId": "F2",
                "text": "In API route: request.body.token reaches verifyToken without a missing-token branch.",
                "severityTier": "medium",
                "scope": "In API route: token validation",
                "location": "app/token.ts: verifyToken",
                "isCatastrophic": False,
            },
            {
                "findingId": "F3",
                "text": "In billing route: request.body.accountId reaches chargeAccount without an ownership branch.",
                "severityTier": "critical",
                "scope": "In billing route: account authorization",
                "location": "app/billing.ts: chargeAccount",
                "isCatastrophic": False,
            },
            {
                "findingId": "F4",
                "text": "Across cache workers: redundant cache refresh runs after every request.",
                "severityTier": "low",
                "scope": "Across cache workers: refresh scheduling",
                "location": "app/cache-worker.ts: refreshCache",
                "isCatastrophic": False,
            },
            {
                "findingId": "F5",
                "text": "Across API endpoints: request.body.email reaches createUser without validation.",
                "severityTier": "high",
                "scope": "Across API endpoints: request validation",
                "location": "app/users.ts: createUser",
                "isCatastrophic": False,
            },
            {
                "findingId": "F6",
                "text": "Across API endpoints: request.body.userId reaches deleteAccount without an ownership branch.",
                "severityTier": "critical",
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

        self.assertEqual(len(telemetry.strengths), 6)
        self.assertEqual(
            [finding.findingId for finding in telemetry.findings],
            ["F6", "F3", "F5", "F2", "F4", "F1"],
        )
        self.assertEqual(
            {directive.findingId for directive in telemetry.directives},
            {"F1", "F2", "F3", "F4", "F5", "F6"},
        )

    def test_exhaustive_response_scores_all_evidence_but_exposes_only_five(self):
        payload = {
            "pros": [f"Verified strength {index} in app/service{index}.ts." for index in range(1, 7)],
            "weaknesses": [
                {
                    "severity": tier,
                    "title": f"Weakness {index}",
                    "root_cause": f"Concrete production root cause {index}.",
                    "file_path": f"app/source{index}.ts",
                }
                for index, tier in enumerate(("low", "medium", "critical", "high", "low", "critical"), start=1)
            ],
            "recommendations": [
                {
                    "target_title": f"Weakness {index}",
                    "actionable_fix": f"Apply the concrete fix for weakness {index}.",
                }
                for index in range(1, 7)
            ],
        }

        report = main.parse_folder_audit_response(json.dumps(payload), previous_score=100)
        self.assertEqual(report["evaluated_score"], 29)
        self.assertEqual(len(report["pros"]), 5)
        self.assertEqual(len(report["cons"]), 5)
        self.assertEqual(len(report["recommendations"]), 5)
        self.assertEqual(
            [finding["severityTier"] for finding in report["finding_impacts"]["cons"]],
            ["critical", "critical", "high", "medium", "low"],
        )
        self.assertEqual(report["finding_impacts"]["cons"][0]["title"], "Weakness 3")
        self.assertEqual(
            report["finding_impacts"]["cons"][0]["root_cause"],
            "Concrete production root cause 3.",
        )
        self.assertEqual(report["finding_impacts"]["cons"][0]["file_path"], "app/source3.ts")
        self.assertEqual(len(report["finding_impacts"]["all_pros"]), 6)
        self.assertEqual(len(report["finding_impacts"]["all_cons"]), 6)
        self.assertEqual(len(report["finding_impacts"]["all_recommendations"]), 6)

        persisted = main.build_project_folder_audit_update_payload(report)
        self.assertEqual(persisted["score"], 29)
        self.assertEqual(persisted["evaluation_score"], 29)
        self.assertEqual(len(persisted["pros"]), 5)
        self.assertEqual(len(persisted["cons"]), 5)
        self.assertEqual(len(persisted["audit_findings"]["all_cons"]), 6)

    def test_verified_score_uses_only_severity_tiers_and_hard_ceilings(self):
        self.assertEqual(main.calculate_verified_score([]), 100)
        self.assertEqual(main.calculate_verified_score([{"severityTier": "low"}]), 98)
        self.assertEqual(main.calculate_verified_score([{"severityTier": "medium"}]), 95)
        self.assertEqual(main.calculate_verified_score([{"severityTier": "high"}]), 88)
        self.assertEqual(main.calculate_verified_score([{"severityTier": "critical"}]), 55)
        self.assertEqual(
            main.calculate_verified_score([{"severityTier": "critical"}, {"severityTier": "critical"}]),
            40,
        )
        self.assertEqual(
            main.calculate_verified_score([{"severityTier": "high"}, {"severityTier": "high"}]),
            75,
        )

    def test_model_penalties_cannot_change_verified_score(self):
        findings = [{"severityTier": "high", "penalty": 0}, {"severityTier": "medium", "penalty": 99}]
        self.assertEqual(main.calculate_verified_score(findings), 83)
        findings[0]["penalty"] = 999
        findings[1]["penalty"] = -999
        self.assertEqual(main.calculate_verified_score(findings), 83)

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
        self.assertEqual(result["evaluated_score"], 100)
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

        self.assertEqual(result["evaluated_score"], 95)
        self.assertEqual(result["cons"], [telemetry.findings[0].text])
        self.assertEqual(result["finding_impacts"]["recommendations"][0]["directiveId"], "D1")
        self.assertEqual(generate_audit.await_args.args[1], main.MELIUSAI_SECURITY_AUDIT_SYSTEM_PROMPT)

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
