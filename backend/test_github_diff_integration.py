"""Audit contract tests use real validation and mocked provider/storage boundaries."""
import base64
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from backend import main
from backend.github_diff_service import CumulativeDiff, DiffServiceError

BASE, HEAD, NEXT = "a" * 40, "b" * 40, "c" * 40
REPORT = {
    "score": 52,
    "score_delta": 0,
    "delta_summary": "Previous audit.",
    "executive_summary": "Previous architecture.",
    "pros": ["Existing Strength: Input validation is consistent."],
    "cons": ["Existing Weakness: Cache invalidation is incomplete."],
    "recommendations": ["Existing Recommendation: Add cache invalidation tests."],
    "finding_impacts": {
        "pros": [{"text": "Existing Strength: Input validation is consistent.", "impactScore": 10}],
        "cons": [{"text": "Existing Weakness: Cache invalidation is incomplete.", "impactScore": -8}],
        "recommendations": [{"text": "Existing Recommendation: Add cache invalidation tests.", "impactScore": 8}],
    },
}


class GitHubConnectionTokenTests(unittest.IsolatedAsyncioTestCase):
    def test_decrypts_the_node_aes_gcm_ciphertext_contract(self):
        user_id = "d0d2aaf1-4878-4c3f-85cc-4bb1d9027db2"
        plaintext = b"github-oauth-token"
        key = bytes(range(32))
        iv = bytes(range(12))
        aad = f"{main.GITHUB_CONNECTION_CIPHER_AAD_PREFIX}{user_id}".encode("utf-8")
        encrypted = main.AESGCM(key).encrypt(iv, plaintext, aad)
        ciphertext = ".".join(
            (
                "v1",
                base64.urlsafe_b64encode(iv).decode("ascii").rstrip("="),
                base64.urlsafe_b64encode(encrypted[-16:]).decode("ascii").rstrip("="),
                base64.urlsafe_b64encode(encrypted[:-16]).decode("ascii").rstrip("="),
            )
        )

        with patch.dict(main.os.environ, {main.GITHUB_CONNECTION_ENCRYPTION_KEY_ENV: key.hex()}):
            self.assertEqual(main.decrypt_github_connection_token(user_id, ciphertext), plaintext.decode("utf-8"))

    async def test_authenticated_request_uses_persisted_token_not_browser_header(self):
        request = SimpleNamespace(
            state=SimpleNamespace(user_id="owner"),
            headers={"x-github-provider-token": "browser-token"},
        )
        with patch.object(
            main,
            "get_persisted_github_connection_token",
            new=AsyncMock(return_value="stored-token"),
        ) as get_stored_token:
            token = await main.get_request_github_access_token(request)

        self.assertEqual(token, "stored-token")
        get_stored_token.assert_awaited_once_with("owner")

    async def test_missing_connection_returns_none_without_crashing(self):
        service_client = Mock()
        query = service_client.table.return_value
        query.select.return_value = query
        query.eq.return_value = query
        query.limit.return_value = query
        query.execute.return_value = SimpleNamespace(data=[])

        with patch.object(main, "get_supabase_service_client", return_value=service_client):
            self.assertIsNone(await main.get_persisted_github_connection_token("owner"))
MODEL_REPORT = {
    "file_impacts": [],
    "new_vulnerabilities": [],
    "resolved_issues": [],
    "updated_architecture_summary": "Improved architecture.",
    "pros": [
        {"text": "Existing Strength: Input validation is consistent."},
        {"text": "New Strength: Cache invalidation is added."},
    ],
    "cons": [{"deductionId": "D1", "text": "Existing Weakness: Cache invalidation is incomplete.", "impactScore": -8}],
    "recommendations": [
        {"deductionId": "D1", "text": "Existing Recommendation: Add cache invalidation tests."},
    ],
}


class GeminiDeltaTests(unittest.TestCase):
    def client(self, count=100, limit=1048576):
        return SimpleNamespace(models=SimpleNamespace(
            get=Mock(return_value=SimpleNamespace(input_token_limit=limit)),
            count_tokens=Mock(return_value=SimpleNamespace(total_tokens=count)),
            generate_content=Mock(return_value=SimpleNamespace(parsed=MODEL_REPORT, candidates=[]))), close=Mock())

    def test_entire_large_delta_and_previous_report_in_single_request(self):
        literal = "@@ -1 +1 @@\n-old\n+" + "whole architecture; " * 10000 + "END_SENTINEL"
        payload = {"total_insertions": 1, "total_deletions": 1,
                   "files": [{"filename": "architecture.py", "insertions": 1, "deletions": 1, "patch": literal}]}
        client = self.client()
        with patch.object(main.genai, "Client", return_value=client):
            main.run_incremental_audit(payload, REPORT, "mock-key")
        client.models.generate_content.assert_called_once()
        prompt = client.models.generate_content.call_args.kwargs["contents"]
        self.assertGreater(len(prompt), 28000)
        self.assertIn("END_SENTINEL", prompt)
        self.assertIn(main.json.dumps(payload, ensure_ascii=False, sort_keys=True), prompt)
        self.assertIn(main.json.dumps(REPORT, ensure_ascii=False, sort_keys=True), prompt)
        self.assertNotIn("{diff_payload}", prompt)
        self.assertEqual(client.models.count_tokens.call_args.kwargs["contents"], prompt)

    def test_merged_model_lists_are_preserved_in_folder_audit(self):
        result = main.build_incremental_folder_audit_result(
            main.IncrementalAuditReport.model_validate(MODEL_REPORT),
            REPORT["score"],
        )
        self.assertEqual(result["folder_score"], 92)
        self.assertEqual(result["score_delta"], 40)
        self.assertEqual(
            result["folder_audit"]["pros"],
            [item["text"] for item in MODEL_REPORT["pros"]],
        )
        self.assertEqual(
            result["folder_audit"]["cons"],
            [item["text"] for item in MODEL_REPORT["cons"]],
        )
        self.assertEqual(
            result["folder_audit"]["recommendations"],
            [item["text"] for item in MODEL_REPORT["recommendations"]],
        )
        self.assertEqual(result["folder_audit"]["finding_impacts"]["pros"], MODEL_REPORT["pros"])

    def test_only_physical_token_overflow_requires_baseline(self):
        client = self.client(count=1048577)
        with patch.object(main.genai, "Client", return_value=client), self.assertRaises(DiffServiceError) as error:
            main.run_incremental_audit({"files": []}, REPORT, "mock-key")
        self.assertEqual(error.exception.code, "GEMINI_CONTEXT_OVERFLOW")
        client.models.generate_content.assert_not_called()

    def test_token_preflight_failure_still_sends_entire_request(self):
        client = self.client()
        client.models.count_tokens.side_effect = RuntimeError("temporarily unavailable")
        with patch.object(main.genai, "Client", return_value=client):
            main.run_incremental_audit({"files": []}, REPORT, "mock-key")
        client.models.generate_content.assert_called_once()

    def test_provider_rate_limit_does_not_request_baseline(self):
        client = self.client()
        error = RuntimeError("quota")
        error.code = 429
        client.models.generate_content.side_effect = error
        with patch.object(main.genai, "Client", return_value=client), self.assertRaises(DiffServiceError) as caught:
            main.run_incremental_audit({"files": []}, REPORT, "mock-key")
        self.assertEqual(caught.exception.code, "GEMINI_RATE_LIMITED")


class VerificationTests(unittest.IsolatedAsyncioTestCase):
    async def exercise(self, *, files=None, provider_error=None, report=REPORT, baseline=False, source_error=None):
        state = {"id": "state", "workspace_id": "folder", "user_id": "owner", "repository": "owner/repo", "branch": "main",
                 "last_verified_commit_sha": BASE, "baseline_version": 7, "previous_verified_report": report}
        delta = CumulativeDiff(1 if files else 0, 0, files or [])
        stored = {"id": "diff", **delta.to_dict()}
        client = Mock()
        query = client.table.return_value
        for method in ["select", "eq", "maybe_single"]:
            getattr(query, method).return_value = query
        # No imported files remain: canonical state must still permit Verify.
        query.execute.side_effect = [SimpleNamespace(data={"id": "folder", **REPORT}), SimpleNamespace(data=[])]
        finalized = AsyncMock(side_effect=lambda _client, _state, _id, audit: audit)
        failed = AsyncMock()
        save = AsyncMock(return_value=stored)
        incremental = Mock(return_value=main.IncrementalAuditReport.model_validate(MODEL_REPORT), side_effect=provider_error)
        with ExitStack() as stack:
            stack.enter_context(patch.object(main, "PROJECT_AUDIT_SEMAPHORE", main.asyncio.Semaphore(2)))
            stack.enter_context(patch.object(main, "LLM_AUDIT_SEMAPHORE", main.asyncio.Semaphore(2)))
            stack.enter_context(patch.object(main, "get_request_supabase_client", return_value=client))
            stack.enter_context(patch.object(main, "_tracking_service_client", return_value=client))
            stack.enter_context(
                patch.object(main, "get_request_github_access_token", new=AsyncMock(return_value="fixture"))
            )
            stack.enter_context(patch.object(main, "_get_gemini_audit_api_key", return_value="fixture"))
            stack.enter_context(patch.object(main.github_diffs, "get_repository_state", new=AsyncMock(return_value=state)))
            stack.enter_context(patch.object(main.github_diffs.GitHubReader, "commit", new=AsyncMock(return_value={"sha": HEAD})))
            stack.enter_context(patch.object(main.github_diffs, "calculate_cumulative_diff", new=AsyncMock(return_value=delta)))
            stack.enter_context(patch.object(main.github_diffs, "load_repository_sources", new=AsyncMock(side_effect=source_error, return_value={"a.py": "print(1)"})))
            stack.enter_context(patch.object(main.github_diffs, "save_workspace_diff", new=save))
            stack.enter_context(patch.object(main.github_diffs, "finalize_verified_audit", new=finalized))
            stack.enter_context(patch.object(main.github_diffs, "mark_diff_failed", new=failed))
            stack.enter_context(patch.object(main, "persist_folder_audit_snapshots", new=AsyncMock(return_value=[])))
            stack.enter_context(patch.object(main, "run_incremental_audit", new=incremental))
            result = await main._run_repository_verification(main.AuditRequest(folder_id="folder", user_id="owner"), Mock(), "owner", baseline=baseline)
        return result, save, finalized, failed, incremental

    async def test_no_change_window_advances_without_ai_even_with_all_assets_deleted(self):
        result, save, finalize, _, ai = await self.exercise()
        self.assertTrue(result["no_changes"])
        ai.assert_not_called()
        save.assert_awaited_once()
        self.assertEqual(save.call_args.args[2], HEAD)
        finalize.assert_awaited_once()

    async def test_full_delta_saved_before_ai_and_pinned_head_finalized(self):
        files = [{"filename": "new.py", "insertions": 1, "deletions": 0, "patch": "+new", "status": "added"}]
        with self.assertLogs(main.logger, level="INFO") as logs:
            result, save, finalize, _, ai = await self.exercise(files=files)
        self.assertEqual(result["folder_score"], 92)
        self.assertEqual(ai.call_args.args[0]["files"], files)
        self.assertEqual(ai.call_args.args[1], REPORT)
        self.assertEqual(save.call_args.args[2], HEAD)
        self.assertEqual(finalize.call_args.args[1]["baseline_version"], 7)
        output = "\n".join(logs.output)
        self.assertIn("GEMINI RESPONSE: Extracted highlights: 2, Improvements: 1", output)
        self.assertIn("DATABASE UPDATE: Successfully saved score 92 for workspace. workspace_id=folder", output)

    async def test_failed_ai_preserves_saved_delta_without_finalizing(self):
        result, save, finalize, failed, _ = await self.exercise(files=[{"filename": "x"}], provider_error=DiffServiceError("GEMINI_RATE_LIMITED", "Retry", 429))
        self.assertEqual(result.status_code, 429)
        save.assert_awaited_once()
        finalize.assert_not_awaited()
        failed.assert_awaited_once()

    async def test_unverified_import_requires_full_baseline(self):
        result, save, finalize, _, ai = await self.exercise(report=None)
        self.assertEqual(main.json.loads(result.body)["code"], "BASELINE_REQUIRED")
        save.assert_not_awaited()
        finalize.assert_not_awaited()
        ai.assert_not_called()

    async def test_incomplete_baseline_never_advances(self):
        result, save, finalize, _, _ = await self.exercise(baseline=True, source_error=DiffServiceError("INCOMPLETE_BASELINE", "Missing file"))
        self.assertEqual(main.json.loads(result.body)["code"], "INCOMPLETE_BASELINE")
        save.assert_not_awaited()
        finalize.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
