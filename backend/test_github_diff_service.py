import base64
import hashlib
import re
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from backend.github_diff_service import (
    CumulativeDiff, DiffServiceError, GitHubReader, calculate_cumulative_diff,
    decode_text, reconstruct_patch, normalize_repository,
)

BASE, HEAD = "a" * 40, "b" * 40
TREE_BASE, TREE_HEAD = "c" * 40, "d" * 40


def blob(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def file_entry(path, data, mode="100644"):
    return {"path": path, "type": "blob", "sha": blob(data), "mode": mode, "size": len(data)}


def apply_hunks(before, patch_text):
    """Independent fixture patch applier: verify reconstructed hunks reproduce head."""
    source = before.splitlines(keepends=True)
    result, cursor = [], 0
    records = patch_text.splitlines(keepends=True)
    i = 0
    while i < len(records):
        record = records[i]
        if record.startswith("@@"):
            start, length = re.match(r"@@ -(\d+)(?:,(\d+))?", record).groups()
            position = int(start) if length == "0" else int(start) - 1
            result.extend(source[cursor:position])
            cursor = position
        else:
            prefix, content = record[0], record[1:]
            if i + 1 < len(records) and records[i + 1].startswith("\\ No newline"):
                content = content[:-1]
                i += 1
            if prefix in {"-", " "}:
                assert source[cursor] == content, (source[cursor], content)
                cursor += 1
            if prefix in {"+", " "}:
                result.append(content)
        i += 1
    result.extend(source[cursor:])
    return "".join(result)


class PatchTests(unittest.TestCase):
    def test_round_trip_edge_cases(self):
        for before, after in [("", "new\nfile\n"), ("gone\nforever", ""), ("old", "new"),
                              ("a\r\nb\r\n", "a\r\nc\r\n"), ("café\n", "☃\n"), ("a\n", "a"),
                              ("", ""), ("unchanged\n", "unchanged\n")]:
            with self.subTest(before=before, after=after):
                delta, adds, removes = reconstruct_patch(before, after)
                self.assertEqual(apply_hunks(before, delta), after)
                self.assertGreaterEqual(adds, 0)
                self.assertGreaterEqual(removes, 0)

    def test_reverted_intermediate_edits_cancel(self):
        self.assertEqual(reconstruct_patch("old\n", "old\n"), ("", 0, 0))

    def test_url_validation(self):
        self.assertEqual(normalize_repository("https://github.com/Owner/Repo.git/"), "owner/repo")
        for url in ["https://github.com.evil.test/a/b", "https://user@github.com/a/b", "http://github.com/a/b", "a/../b", "https://github.com/a/b?token=x"]:
            with self.assertRaises(DiffServiceError):
                normalize_repository(url)

    def test_unsupported_encoding_is_not_silently_dropped(self):
        with self.assertRaises(DiffServiceError):
            decode_text(b"name = '\xe9'", "auth.py")
        self.assertIsNone(decode_text(b"\x89PNG\0", "image.png"))


class DiffTests(unittest.IsolatedAsyncioTestCase):
    async def calculate(self, handler):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await calculate_cumulative_diff("owner/repo", BASE, HEAD, access_token="fixture-token", http_client=client)

    async def test_compare_uses_one_complete_window_even_over_250_commits(self):
        requests = []
        fixtures, _ = self.fixture([("backend/auth.py", b"old\n", "100644")],
                                  [("backend/auth.py", b"first\nsecond\n", "100644")])
        def handler(request):
            requests.append(request)
            if "/compare/" not in request.url.path:
                return fixtures(request)
            return httpx.Response(200, json={"status": "ahead", "total_commits": 600,
                "merge_base_commit": {"sha": BASE}, "commits": [{"sha": "e" * 40}] * 250,
                "files": [{"filename": "backend/auth.py", "status": "modified", "additions": 2, "deletions": 1,
                           "patch": "@@ -1 +1,2 @@\n-old\n+first\n+second"}]})
        result = await self.calculate(handler)
        self.assertEqual(result.total_insertions, 2)
        self.assertEqual(result.total_deletions, 1)
        self.assertEqual(result.files[0]["filename"], "backend/auth.py")
        self.assertEqual(sum('/compare/' in r.url.path for r in requests), 1)
        self.assertEqual(requests[0].url.path, f"/repos/owner/repo/compare/{BASE}...{HEAD}")

    def fixture(self, before, after, comparison=None, truncated=False):
        requests, bodies = [], {}
        for _, data, _ in before + after:
            bodies[blob(data)] = data
        def handler(request):
            requests.append(request.url.path)
            path = request.url.path
            if "/compare/" in path:
                return httpx.Response(200, json=comparison or {"status": "diverged", "files": []})
            if "/commits/" in path:
                sha = TREE_BASE if path.endswith(BASE) else TREE_HEAD
                return httpx.Response(200, json={"commit": {"tree": {"sha": sha}}})
            if "/git/trees/" in path:
                items = before if path.endswith(TREE_BASE) else after
                return httpx.Response(200, json={"truncated": truncated and "recursive" in request.url.params,
                    "tree": [file_entry(p, d, m) for p, d, m in items]})
            sha = path.rsplit("/", 1)[-1]
            data = bodies[sha]
            return httpx.Response(200, json={"encoding": "base64", "size": len(data), "content": base64.b64encode(data).decode()})
        return handler, requests

    async def test_tree_fallback_new_deleted_binary_empty_modes_and_paths(self):
        before = [("deleted.py", b"old\n", "100644"), ("run.sh", b"echo hi\n", "100644")]
        after = [(" space/☃.py", b"new", "100644"), ("empty.py", b"", "100644"),
                 ("image.png", b"\x89PNG\0", "100644"), ("run.sh", b"echo hi\n", "100755"),
                 ("link.py", b"elsewhere.py", "120000")]
        handler, _ = self.fixture(before, after, truncated=True)
        result = await self.calculate(handler)
        by_path = {f["filename"]: f for f in result.files}
        self.assertEqual(result.total_insertions, 2)
        self.assertEqual(result.total_deletions, 1)
        self.assertEqual(by_path["deleted.py"]["status"], "removed")
        self.assertEqual(by_path["run.sh"]["new_mode"], "100755")
        self.assertEqual(by_path["run.sh"]["patch"], "")
        self.assertIsNone(by_path["image.png"]["patch"])
        self.assertTrue(by_path["link.py"]["is_symlink"])
        self.assertEqual(by_path["empty.py"]["patch"], "")

    async def test_rename_preserved_when_patch_missing(self):
        comparison = {"status": "ahead", "merge_base_commit": {"sha": BASE}, "files": [
            {"status": "renamed", "filename": "new.py", "previous_filename": "old.py", "additions": 0, "deletions": 0}]}
        handler, _ = self.fixture([("old.py", b"x\n", "100644")], [("new.py", b"x\n", "100644")], comparison)
        result = await self.calculate(handler)
        self.assertEqual(len(result.files), 1)
        self.assertEqual(result.files[0]["previous_filename"], "old.py")
        self.assertEqual(result.total_insertions, 0)

    async def test_300_file_boundary_reconstructs_all_paths(self):
        comparison = {"status": "ahead", "merge_base_commit": {"sha": BASE}, "files": [{}] * 300}
        after = [(f"{n}.py", b"x\n", "100644") for n in range(301)]
        handler, _ = self.fixture([], after, comparison)
        result = await self.calculate(handler)
        self.assertEqual(len(result.files), 301)
        self.assertEqual(result.total_insertions, 301)

    async def test_truncated_hunk_is_reconstructed(self):
        comparison = {"status": "ahead", "merge_base_commit": {"sha": BASE}, "files": [
            {"status": "modified", "filename": "a.py", "patch": "@@ -1 +1,2 @@\n-old\n+one", "additions": 2, "deletions": 1}]}
        handler, _ = self.fixture([("a.py", b"old\n", "100644")], [("a.py", b"one\ntwo\n", "100644")], comparison)
        result = await self.calculate(handler)
        self.assertEqual(result.total_insertions, 2)
        self.assertEqual(apply_hunks("old\n", result.files[0]["patch"]), "one\ntwo\n")

    async def test_same_sha_skips_network(self):
        result = await calculate_cumulative_diff("owner/repo", BASE, BASE, access_token=None)
        self.assertEqual(result, CumulativeDiff(0, 0, []))

    async def test_baseline_unavailable_is_explicit(self):
        with self.assertRaises(DiffServiceError) as error:
            await self.calculate(lambda _: httpx.Response(404))
        self.assertEqual(error.exception.code, "BASELINE_UNAVAILABLE")

    async def test_auth_error_not_retried_or_rebaselined(self):
        requests = []
        def handler(request):
            requests.append(request)
            return httpx.Response(401)
        with self.assertRaises(DiffServiceError) as error:
            await self.calculate(handler)
        self.assertEqual(error.exception.code, "GITHUB_AUTH_REQUIRED")
        self.assertEqual(len(requests), 1)

    async def test_rate_limit_retries_are_bounded(self):
        requests = []
        def handler(request):
            requests.append(request)
            return httpx.Response(429, headers={"retry-after": "0"})
        with self.assertRaises(DiffServiceError) as error:
            await self.calculate(handler)
        self.assertEqual(error.exception.code, "GITHUB_RATE_LIMITED")
        self.assertEqual(len(requests), 3)

    async def test_redirect_does_not_forward_credentials(self):
        with self.assertRaises(DiffServiceError):
            await self.calculate(lambda _: httpx.Response(302, headers={"location": "https://elsewhere.test/"}))

    async def test_blob_integrity(self):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={
            "content": "eA==", "encoding": "base64", "size": 1}))) as client:
            with self.assertRaises(DiffServiceError):
                await GitHubReader(client, "owner/repo", None).blob({"sha": BASE})


if __name__ == "__main__":
    unittest.main()
