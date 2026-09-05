"""Exact repository deltas, independent of FastAPI and the AI provider.

Only immutable GitHub objects are read. No checkout or local Git process is used.
Database writes go through service-role-only RPCs; pass an authenticated user ID.
"""
from __future__ import annotations

import asyncio
import base64
import difflib
import hashlib
import os
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from typing import Any, Callable
from urllib.parse import quote, urlsplit

import httpx

_DB_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="github-diff-db")
API_VERSION = "2026-03-10"
SHA_PATTERN = r"(?:[0-9a-f]{40}|[0-9a-f]{64})"


class DiffServiceError(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code, self.status = code, status


@dataclass(frozen=True)
class CumulativeDiff:
    total_insertions: int
    total_deletions: int
    files: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def validate_sha(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(SHA_PATTERN, value.lower()):
        raise DiffServiceError("INVALID_COMMIT", "A full Git commit SHA is required.")
    return value.lower()


def normalize_repository(repo_url: str) -> str:
    if not isinstance(repo_url, str):
        raise DiffServiceError("INVALID_REPOSITORY", "A GitHub repository URL is required.")
    value = repo_url.strip()
    if "://" in value:
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or parsed.netloc.lower() != "github.com"
                or parsed.query or parsed.fragment):
            raise DiffServiceError("INVALID_REPOSITORY", "Use an https://github.com/owner/repository URL.")
        value = parsed.path.strip("/")
    if value.endswith(".git"):
        value = value[:-4]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", value) or any(
        part in {".", ".."} for part in value.split("/")
    ):
        raise DiffServiceError("INVALID_REPOSITORY", "Repository must use owner/repository format.")
    return value.lower()


def _path(value: Any) -> str:
    # Git paths are opaque: do not strip whitespace or rewrite backslashes.
    if (not isinstance(value, str) or not value or value.startswith("/")
            or "\x00" in value or any(p in {"", ".", ".."} for p in value.split("/"))):
        raise DiffServiceError("INCOMPLETE_DIFF", "GitHub returned an invalid file path.")
    return value


def _assemble(files: list[dict[str, Any]]) -> CumulativeDiff:
    files.sort(key=lambda item: item["filename"])
    return CumulativeDiff(sum(f["insertions"] for f in files), sum(f["deletions"] for f in files), files)


class GitHubReader:
    def __init__(self, client: httpx.AsyncClient, repository: str, token: str | None):
        self.client, self.repository = client, normalize_repository(repository)
        api = os.getenv("GITHUB_API_BASE_URL", "https://api.github.com").rstrip("/")
        parsed = urlsplit(api)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.query or parsed.fragment:
            raise DiffServiceError("INVALID_CONFIGURATION", "Invalid GitHub API base URL.", 503)
        self.root = f"{api}/repos/{quote(self.repository, safe='/')}"
        self.headers = {"Accept": "application/vnd.github+json", "User-Agent": "MeliusAI-Diff/1.0",
                        "X-GitHub-Api-Version": os.getenv("GITHUB_API_VERSION", API_VERSION)}
        if token:
            self.headers["Authorization"] = f"Bearer {token}"
        self.semaphore = asyncio.Semaphore(2)
        self.blobs: dict[str, bytes] = {}

    async def get(self, suffix: str, *, params=None, missing_code="GITHUB_NOT_FOUND") -> dict:
        for attempt in range(3):
            try:
                async with self.semaphore:
                    response = await self.client.get(self.root + suffix, params=params, headers=self.headers,
                                                     follow_redirects=False, timeout=30)
            except httpx.TransportError as error:
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise DiffServiceError("GITHUB_UNAVAILABLE", "GitHub could not be reached. Retry verification.", 502) from error
            limited = response.status_code == 429 or (response.status_code == 403 and (
                response.headers.get("x-ratelimit-remaining") == "0" or "retry-after" in response.headers
                or "rate limit" in response.text.lower()))
            if limited or response.status_code >= 500:
                if attempt < 2:
                    try:
                        delay = min(max(float(response.headers.get("retry-after", 2 ** attempt)), 0), 5)
                    except ValueError:
                        delay = 2 ** attempt
                    await asyncio.sleep(delay)
                    continue
                code = "GITHUB_RATE_LIMITED" if limited else "GITHUB_UNAVAILABLE"
                raise DiffServiceError(code, "GitHub is temporarily unavailable. Retry verification.", 429 if limited else 502)
            if response.status_code in {401, 403}:
                raise DiffServiceError("GITHUB_AUTH_REQUIRED", "Reconnect GitHub with repository read access.", response.status_code)
            if response.status_code == 404:
                raise DiffServiceError(missing_code, "GitHub repository or commit is unavailable with the current credentials.", 422)
            if not response.is_success:
                raise DiffServiceError("INCOMPLETE_DIFF", f"GitHub returned HTTP {response.status_code}; the baseline was retained.", 502)
            try:
                result = response.json()
                if not isinstance(result, dict):
                    raise ValueError()
                return result
            except ValueError as error:
                raise DiffServiceError("INCOMPLETE_DIFF", "GitHub returned invalid JSON.", 502) from error
        raise AssertionError("unreachable")

    async def commit(self, ref: str, *, baseline=False) -> dict:
        return await self.get("/commits/" + quote(ref, safe=""),
                              missing_code="BASELINE_UNAVAILABLE" if baseline else "GITHUB_NOT_FOUND")

    async def tree(self, commit_sha: str, *, baseline=False) -> dict[str, dict]:
        commit = await self.commit(validate_sha(commit_sha), baseline=baseline)
        try:
            tree_sha = validate_sha(commit["commit"]["tree"]["sha"])
        except (KeyError, TypeError) as error:
            raise DiffServiceError("INCOMPLETE_DIFF", "GitHub omitted the commit tree.") from error
        result = await self.get("/git/trees/" + tree_sha, params={"recursive": "1"})
        entries: dict[str, dict] = {}

        def add(item, prefix=""):
            if not isinstance(item, dict) or item.get("type") not in {"blob", "tree", "commit"}:
                raise DiffServiceError("INCOMPLETE_DIFF", "Invalid Git tree entry.")
            path = _path(prefix + _path(item.get("path")))
            validate_sha(item.get("sha", ""))
            if item["type"] != "tree":
                if path in entries:
                    raise DiffServiceError("INCOMPLETE_DIFF", "Duplicate Git tree path.")
                entries[path] = item
            return path

        if result.get("truncated") is False and isinstance(result.get("tree"), list):
            for item in result["tree"]:
                add(item)
            return entries
        # Discard truncated results and walk every subtree, without recursive=0
        # (GitHub treats any recursive parameter value as true).
        queue = [(tree_sha, "")]
        while queue:
            sha, prefix = queue.pop()
            subtree = await self.get("/git/trees/" + sha)
            if subtree.get("truncated") is not False or not isinstance(subtree.get("tree"), list):
                raise DiffServiceError("INCOMPLETE_DIFF", "GitHub omitted part of a repository tree.")
            for item in subtree["tree"]:
                path = add(item, prefix)
                if item["type"] == "tree":
                    queue.append((item["sha"], path + "/"))
        return entries

    async def blob(self, entry: dict | None) -> bytes:
        if entry is None:
            return b""
        sha = validate_sha(entry["sha"])
        if sha not in self.blobs:
            result = await self.get("/git/blobs/" + sha, missing_code="INCOMPLETE_DIFF")
            try:
                if result.get("encoding") != "base64":
                    raise ValueError()
                data = base64.b64decode("".join(result["content"].split()), validate=True)
                digest = hashlib.sha1 if len(sha) == 40 else hashlib.sha256
                if len(data) != result["size"] or digest(f"blob {len(data)}\0".encode() + data).hexdigest() != sha:
                    raise ValueError()
            except (KeyError, TypeError, ValueError) as error:
                raise DiffServiceError("INCOMPLETE_DIFF", "GitHub returned incomplete blob content.") from error
            self.blobs[sha] = data
        return self.blobs[sha]


def _patch_counts(patch: str) -> tuple[int, int] | None:
    """Validate every unified hunk; patch counts never include file headers."""
    additions = deletions = 0
    old_left = new_left = 0
    in_hunk = False
    for line in patch.split("\n"):
        if line.startswith("@@"):
            if old_left or new_left:
                return None
            match = re.match(r"^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@", line)
            if not match:
                return None
            old_left = int(match[1]) if match[1] is not None else 1
            new_left = int(match[2]) if match[2] is not None else 1
            in_hunk = True
        elif line.startswith("\\ No newline at end of file") or line == "":
            continue
        elif not in_hunk:
            return None
        elif line.startswith("+"):
            additions += 1
            new_left -= 1
        elif line.startswith("-"):
            deletions += 1
            old_left -= 1
        elif line.startswith(" "):
            old_left -= 1
            new_left -= 1
        else:
            return None
        if min(old_left, new_left) < 0:
            return None
    return (additions, deletions) if in_hunk and old_left == new_left == 0 else None


def _compare_files(payload: dict, base: str) -> list[dict] | None:
    files = payload.get("files")
    merge_base = payload.get("merge_base_commit")
    if (payload.get("status") not in {"ahead", "identical"}
            or not isinstance(merge_base, dict) or merge_base.get("sha") != base
            or not isinstance(files, list) or len(files) >= 300):
        return None
    result, seen = [], set()
    for item in files:
        if not isinstance(item, dict):
            return None
        filename = _path(item.get("filename"))
        patch = item.get("patch")
        if filename in seen or not isinstance(patch, str) or not patch:
            return None
        seen.add(filename)
        counts = _patch_counts(patch)
        if counts != (item.get("additions"), item.get("deletions")):
            return None
        if item.get("status") not in {"added", "removed", "modified", "renamed", "copied", "changed"}:
            return None
        file = {"filename": filename, "insertions": counts[0], "deletions": counts[1],
                "patch": patch, "status": item["status"], "patch_source": "github"}
        if item.get("previous_filename"):
            file["previous_filename"] = _path(item["previous_filename"])
        result.append(file)
    return result


def decode_text(data: bytes, filename: str) -> str | None:
    if data.startswith((b"\xff\xfe", b"\xfe\xff", b"\x00\x00\xfe\xff")):
        raise DiffServiceError("INCOMPLETE_DIFF", f"Unsupported text encoding in {filename}; no changes were discarded.")
    if b"\x00" in data[:8000]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as error:
        # Recognize binary formats, but never pretend undecodable source is binary.
        if data.startswith((b"\x89PNG", b"\xff\xd8\xff", b"GIF8", b"PK\x03\x04", b"%PDF", b"\x1f\x8b")):
            return None
        raise DiffServiceError("INCOMPLETE_DIFF", f"Unsupported text encoding in {filename}; no changes were discarded.") from error


def _lines(text: str) -> list[str]:
    # str.splitlines also splits Unicode control characters that Git treats as text.
    parts = text.split("\n")
    return [part + "\n" for part in parts[:-1]] + ([parts[-1]] if parts[-1] else [])


def reconstruct_patch(before: str, after: str) -> tuple[str, int, int]:
    lines = list(difflib.unified_diff(_lines(before), _lines(after), n=3))[2:]
    patch = "".join(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n" for line in lines)
    counts = _patch_counts(patch) if patch else (0, 0)
    if counts is None:
        raise DiffServiceError("INCOMPLETE_DIFF", "Unable to reconstruct a complete text patch.")
    return patch, *counts


async def _tree_diff(reader: GitHubReader, base: str, head: str, comparison: dict, trees=None) -> CumulativeDiff:
    before, after = trees if trees is not None else await asyncio.gather(reader.tree(base, baseline=True), reader.tree(head))
    removed, added = set(before) - set(after), set(after) - set(before)
    renames: dict[str, str] = {}
    for item in (comparison.get("files") or []):
        if isinstance(item, dict) and item.get("status") == "renamed":
            old, new = item.get("previous_filename"), item.get("filename")
            if old in removed and new in added:
                renames[new] = old
                removed.remove(old)
                added.remove(new)
    paths = sorted(set(before) | set(after))
    files = []
    for path in paths:
        if path in renames.values():
            continue
        previous_path = renames.get(path, path)
        old, new = before.get(previous_path), after.get(path)
        if old and new and old["sha"] == new["sha"] and old["mode"] == new["mode"] and previous_path == path:
            continue
        status = "renamed" if path in renames else "added" if old is None else "removed" if new is None else "modified"
        file = {"filename": path, "insertions": 0, "deletions": 0, "patch": "", "status": status,
                "patch_source": "reconstructed", "old_sha": old["sha"] if old else None,
                "new_sha": new["sha"] if new else None, "old_mode": old["mode"] if old else None,
                "new_mode": new["mode"] if new else None}
        if path in renames:
            file["previous_filename"] = previous_path
        has_submodule = any(entry and entry["type"] == "commit" for entry in (old, new))
        if has_submodule and not any(entry and entry["type"] == "blob" for entry in (old, new)):
            file.update(patch=None, non_text_reason="submodule")
        else:
            old_bytes, new_bytes = await asyncio.gather(
                reader.blob(old if old and old["type"] == "blob" else None),
                reader.blob(new if new and new["type"] == "blob" else None))
            old_text, new_text = decode_text(old_bytes, previous_path), decode_text(new_bytes, path)
            if old_text is None or new_text is None:
                file.update(patch=None, non_text_reason="binary")
            else:
                file["patch"], file["insertions"], file["deletions"] = await asyncio.get_running_loop().run_in_executor(
                    _DB_EXECUTOR, reconstruct_patch, old_text, new_text)
            if any(entry and entry["mode"] == "120000" for entry in (old, new)):
                file["is_symlink"] = True
            if has_submodule:
                file["non_text_reason"] = "submodule"
        files.append(file)
    return _assemble(files)


async def calculate_cumulative_diff(repo_url, last_verified_sha, current_sha, *, access_token, http_client=None) -> CumulativeDiff:
    base, head = validate_sha(last_verified_sha), validate_sha(current_sha)
    repository = normalize_repository(repo_url)
    if base == head:
        return _assemble([])
    if http_client is None:
        async with httpx.AsyncClient() as client:
            return await calculate_cumulative_diff(repository, base, head, access_token=access_token, http_client=client)
    reader = GitHubReader(http_client, repository, access_token)
    try:
        comparison = await reader.get(f"/compare/{base}...{head}", missing_code="BASELINE_UNAVAILABLE")
    except DiffServiceError as error:
        if error.code not in {"BASELINE_UNAVAILABLE", "INCOMPLETE_DIFF"}:
            raise
        comparison = {}
    files = _compare_files(comparison, base)
    if files is not None:
        # Compare does not expose file modes or object types. Verify its inventory
        # against immutable trees so mode-only, symlink and submodule changes
        # cannot disappear behind otherwise valid text patches.
        trees = await asyncio.gather(reader.tree(base, baseline=True), reader.tree(head))
        before, after = trees
        changed = {path for path in set(before) | set(after) if
                   tuple(before.get(path, {}).get(k) for k in ("sha", "mode", "type")) !=
                   tuple(after.get(path, {}).get(k) for k in ("sha", "mode", "type"))}
        covered = set()
        for item in files:
            path, previous = item["filename"], item.get("previous_filename", item["filename"])
            old, new = before.get(previous), after.get(path)
            covered.add(path)
            if previous != path:
                covered.add(previous)
            if any(entry and (entry["type"] == "commit" or entry["mode"] == "120000") for entry in (old, new)):
                return await _tree_diff(reader, base, head, comparison, trees)
            item.update(old_sha=old["sha"] if old else None, new_sha=new["sha"] if new else None,
                        old_mode=old["mode"] if old else None, new_mode=new["mode"] if new else None)
        if covered == changed:
            return _assemble(files)
        return await _tree_diff(reader, base, head, comparison, trees)
    return await _tree_diff(reader, base, head, comparison)


async def load_repository_sources(reader: GitHubReader, sha: str, eligible: Callable[[str], bool]) -> dict[str, str]:
    tree = await reader.tree(sha)
    result = {}
    for path, entry in sorted(tree.items()):
        if entry["type"] == "blob" and entry["mode"] != "120000" and eligible(path):
            content = decode_text(await reader.blob(entry), path)
            if content is None:
                raise DiffServiceError("INCOMPLETE_BASELINE", f"Cannot audit binary source {path}.")
            result[path] = content
    return result


async def _db(call):
    try:
        response = await asyncio.get_running_loop().run_in_executor(_DB_EXECUTOR, call)
        return response.data
    except Exception as error:
        message = str(error)
        for code, status in (("VERIFY_CONFLICT", 409), ("REPOSITORY_BINDING_CONFLICT", 409),
                             ("WORKSPACE_NOT_FOUND", 404), ("INVALID_DIFF", 422)):
            if code in message:
                raise DiffServiceError(code, code.replace("_", " ").capitalize() + ".", status) from error
        raise DiffServiceError("DIFF_PERSISTENCE_FAILED", "Repository tracking could not be saved. The verification baseline was retained.", 502) from error


async def get_repository_state(client, workspace_id: str, user_id: str) -> dict | None:
    rows = await _db(lambda: client.table("workspace_repository_states").select("*").eq("workspace_id", workspace_id).eq("user_id", user_id).execute())
    return rows[0] if rows else None


async def initialize_repository_baseline(client, workspace_id, user_id, repository, branch, commit_sha) -> dict:
    return await _db(lambda: client.rpc("initialize_repository_baseline", {
        "p_workspace_id": workspace_id, "p_user_id": user_id, "p_repository": normalize_repository(repository),
        "p_branch": branch, "p_commit_sha": validate_sha(commit_sha),
    }).execute())


async def save_workspace_diff(client, state, head_sha: str, delta: CumulativeDiff, *, audit_kind="incremental") -> dict:
    return await _db(lambda: client.rpc("save_workspace_diff", {
        "p_state_id": state["id"], "p_user_id": state["user_id"], "p_expected_version": state["baseline_version"],
        "p_base_sha": state["last_verified_commit_sha"], "p_head_sha": validate_sha(head_sha),
        "p_delta": delta.to_dict(), "p_audit_kind": audit_kind,
    }).execute())


async def finalize_verified_audit(client, state, diff_id: str, report: dict) -> dict:
    return await _db(lambda: client.rpc("finalize_verified_audit", {
        "p_diff_id": diff_id, "p_user_id": state["user_id"], "p_expected_version": state["baseline_version"],
        "p_report": report,
    }).execute())


async def mark_diff_failed(client, diff_id: str, user_id: str, code: str) -> None:
    await _db(lambda: client.rpc("mark_workspace_diff_failed", {
        "p_diff_id": diff_id, "p_user_id": user_id, "p_error_code": code,
    }).execute())
