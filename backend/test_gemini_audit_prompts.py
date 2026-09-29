import json
import logging
import random
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
        self.assertIn("`executive_summary`", prompt)
        self.assertIn("overall security posture, architectural maturity, and primary business risks", prompt)
        self.assertIn("acknowledge basic foundational engineering practices", prompt)
        self.assertIn("Only return an empty list if the code has absolutely zero structural merit", prompt)
        self.assertIn("`severity`, `title`, `root_cause`, and `file_path`", prompt)
        self.assertNotIn("Top 5", prompt)
        self.assertNotIn("return 5", prompt.lower())
        self.assertNotIn("penalty", prompt.lower())

        finding_schema = main.AuditTelemetryResponse.model_json_schema()["$defs"]["AuditTelemetryFinding"]
        self.assertIn("severityTier", finding_schema["properties"])
        self.assertNotIn("severityTier", finding_schema["required"])
        provider_schema = main.GeminiAuditResponse.model_json_schema()
        self.assertEqual(
            set(provider_schema["properties"]),
            {"executive_summary", "pros", "weaknesses", "recommendations"},
        )
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
        self.assertEqual(
            main.calculate_audit_score(impacts),
            main.calculate_verified_score(impacts["cons"]),
        )

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
            "executive_summary": (
                "The codebase has several material security weaknesses that could expose customer data and "
                "interrupt core workflows. Its modular structure provides a foundation for targeted hardening."
            ),
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
        expected_score = main.calculate_verified_score(
            report["finding_impacts"]["all_cons"]
        )
        self.assertEqual(report["evaluated_score"], expected_score)
        self.assertEqual(report["executive_summary"], payload["executive_summary"])
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
        self.assertEqual(persisted["score"], expected_score)
        self.assertEqual(persisted["evaluation_score"], expected_score)
        self.assertEqual(persisted["executive_summary"], payload["executive_summary"])
        self.assertEqual(persisted["audit_summary"], payload["executive_summary"])
        self.assertEqual(len(persisted["pros"]), 5)
        self.assertEqual(len(persisted["cons"]), 5)
        self.assertEqual(len(persisted["audit_findings"]["all_cons"]), 6)

    def test_verified_score_uses_stable_dynamic_severity_penalties(self):
        self.assertEqual(main.calculate_verified_score([]), 100)
        for tier, (minimum, maximum) in main.PENALTY_RANGES.items():
            finding = {"severityTier": tier, "title": f"{tier} finding"}
            expected = 100 - random.Random(f"{tier} finding").randint(
                minimum,
                maximum,
            )
            self.assertEqual(main.calculate_verified_score([finding]), expected)
            self.assertEqual(main.calculate_verified_score([finding]), expected)

        unknown_tier = {"severityTier": "unexpected", "title": "unknown finding"}
        expected_medium = 100 - random.Random("unknown finding").randint(2, 4)
        self.assertEqual(main.calculate_verified_score([unknown_tier]), expected_medium)

        root_cause_only = {
            "severityTier": "high",
            "root_cause": "Authorization is skipped before changing account state.",
        }
        expected_high = 100 - random.Random(root_cause_only["root_cause"]).randint(5, 7)
        self.assertEqual(main.calculate_verified_score([root_cause_only]), expected_high)

    def test_verified_score_uses_standard_and_catastrophic_floors(self):
        def findings(tier, count):
            return [
                {"severityTier": tier, "title": f"{tier} finding {index}"}
                for index in range(count)
            ]

        standard_floor_findings = (
            findings("critical", 4)
            + findings("high", 4)
            + findings("medium", 15)
        )
        self.assertEqual(main.calculate_verified_score(standard_floor_findings), 30)

        five_critical_findings = findings("critical", 5) + findings("high", 20)
        self.assertEqual(main.calculate_verified_score(five_critical_findings), 20)

        combined_catastrophic_findings = (
            findings("critical", 4)
            + findings("high", 5)
            + findings("medium", 20)
        )
        self.assertEqual(main.calculate_verified_score(combined_catastrophic_findings), 20)

    def test_model_penalties_cannot_change_verified_score(self):
        findings = [
            {"severityTier": "high", "title": "session authorization", "penalty": 0},
            {"severityTier": "medium", "title": "input validation", "penalty": 99},
        ]
        expected_score = main.calculate_verified_score(findings)
        findings[0]["penalty"] = 999
        findings[1]["penalty"] = -999
        self.assertEqual(main.calculate_verified_score(findings), expected_score)

    def test_google_genai_afc_filter_removes_only_the_known_advisory(self):
        warning = logging.LogRecord(
            "google_genai.models",
            logging.WARNING,
            __file__,
            1,
            "Direct use of automatic function calling (AFC) in AsyncModels.generate_content is not recommended.",
            (),
            None,
        )
        unrelated_warning = logging.LogRecord(
            "google_genai.models",
            logging.WARNING,
            __file__,
            1,
            "Gemini request failed after retrying.",
            (),
            None,
        )
        warning_filter = main._GoogleGenAIAFCWarningFilter()
        self.assertFalse(warning_filter.filter(warning))
        self.assertTrue(warning_filter.filter(unrelated_warning))

    async def test_stored_file_full_audit_finalizes_a_repository_baseline(self):
        state = {
            "id": "state-1",
            "workspace_id": "folder-1",
            "user_id": "owner-1",
            "repository": "owner/repository",
            "branch": "main",
            "last_verified_commit_sha": "a" * 40,
            "baseline_version": 0,
        }
        folder_audit = {
            "delta_summary": "Full audit completed from synced source files.",
            "executive_summary": "The synced repository has a verified full baseline.",
            "pros": ["The routing boundary is isolated."],
            "cons": ["The route interpolates untrusted input into SQL."],
            "recommendations": ["Use a parameterized query in the route."],
            "finding_impacts": {
                "pros": [{"text": "The routing boundary is isolated."}],
                "cons": [{
                    "text": "The route interpolates untrusted input into SQL.",
                    "severityTier": "critical",
                }],
                "recommendations": [{"text": "Use a parameterized query in the route."}],
                "all_pros": [{"text": "The routing boundary is isolated."}],
                "all_cons": [{
                    "text": "The route interpolates untrusted input into SQL.",
                    "severityTier": "critical",
                }],
                "all_recommendations": [{"text": "Use a parameterized query in the route."}],
            },
        }
        initialize = AsyncMock(return_value=state)
        save = AsyncMock(return_value={"id": "diff-1"})
        finalize = AsyncMock(side_effect=lambda _client, _state, _diff_id, report: report)

        with patch.object(main.github_diffs, "get_repository_state", new=AsyncMock(return_value=None)), patch.object(
            main.github_diffs, "initialize_repository_baseline", new=initialize
        ), patch.object(main.github_diffs, "save_workspace_diff", new=save), patch.object(
            main.github_diffs, "finalize_verified_audit", new=finalize
        ):
            report = await main.persist_full_github_audit_baseline(
                object(),
                folder_id="folder-1",
                user_id="owner-1",
                repository="owner/repository",
                branch="main",
                commit_sha="a" * 40,
                folder_audit=folder_audit,
            )

        initialize.assert_awaited_once()
        save.assert_awaited_once()
        self.assertEqual(save.await_args.args[2], "a" * 40)
        self.assertEqual(save.await_args.kwargs["audit_kind"], "baseline")
        self.assertEqual(
            report["score"],
            main.calculate_verified_score(folder_audit["finding_impacts"]["all_cons"]),
        )
        self.assertEqual(report["finding_impacts"]["cons"], folder_audit["finding_impacts"]["all_cons"])
        finalize.assert_awaited_once()

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

        self.assertEqual(
            result["evaluated_score"],
            main.calculate_verified_score(result["finding_impacts"]["cons"]),
        )
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
