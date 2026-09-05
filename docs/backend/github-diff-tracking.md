# Repository verification deltas

The diff service captures a repository's net baseline-to-head change on Verify.
Edits subsequently reverted cancel out. Webhooks synchronize assets but never
move this baseline or invoke an AI audit.

## Installation and rollout

1. Install `backend/requirements.txt`, including SQLAlchemy 2.0.48. SQLAlchemy
   describes the tables; runtime operations use the existing Supabase client.
2. Apply `supabase/migrations/202609050001_workspace_cumulative_diffs.sql` to the
   existing database **before deploying the application changes**. Use the linked
   project's normal `supabase db push` workflow or run this exact migration in its
   SQL editor. Do not use `Base.metadata.create_all()`: the migration also installs
   RLS, immutable-payload protection and transactional RPCs.
3. Configure the backend's `SUPABASE_SERVICE_ROLE_KEY` and Supabase URL. Keep the
   service credential on the backend. Supply one of `GEMINI_API_KEY`,
   `GOOGLE_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY` for Gemini.
4. Deploy backend and frontend together. Existing repository folders require one
   new full baseline audit because per-file snapshots do not establish the
   repository-wide coverage of the new tracker. Historical snapshots are retained.

## Service contract

```python
from backend.github_diff_service import calculate_cumulative_diff

delta = await calculate_cumulative_diff(
    "https://github.com/owner/repo", baseline_sha, current_sha,
    access_token=github_token,
)
payload = delta.to_dict()
# {"total_insertions": ..., "total_deletions": ..., "files": [...]}
```

Each file contains its repository-relative filename, counts, literal unified
patch, and status. Metadata includes old/new blob SHAs and modes, rename origins,
symlink flags, and binary/submodule reasons. Binary-only changes have `patch: null`
and zero text-line counts. Empty files and pure mode changes have an empty patch.
UTF-8 content and line endings are preserved; unsupported text encodings produce
an explicit incomplete-diff error.

GitHub Compare is requested for the whole window, never summed across commits.
The inventory is checked against immutable trees, including file modes. At the
300-file boundary, missing/malformed patches, or divergent history, the service
reconstructs direct changes from GitHub blobs. Recursive tree truncation causes
traversal of individual subtrees. GitHub-reported renames are retained; other path
moves appear as deletion plus addition. Reconstructed counts describe those actual
edits and can differ from GitHub's choice of diff hunks or rename heuristics;
`patch_source` records the distinction.

The module never checks out a repository or invokes Git. Requests target the
configured GitHub API host, reject redirects, use up to two concurrent requests,
and retry transient failures at most twice. Blob lengths and Git object hashes
are checked before reconstruction.

## Lifecycle

- Import pins a commit before fetching its tree/blobs and saves that SHA on
  imported records. `POST /api/github/workspaces/{folder_id}/initialize` accepts
  `{repository, branch, commit_sha}` and a Supabase bearer session. It validates
  ownership and matching persisted import metadata, then initializes an unverified
  baseline. Repeated initialization cannot reset it. This endpoint does not receive
  a GitHub provider credential.
- `POST /api/audit-project/baseline` resolves GitHub head through the existing
  Verify authentication flow and audits eligible sources from that exact tree.
  Every file audit and the final judge must succeed before establishing a baseline.
- `POST /api/audit-project` reads canonical state/report, pins head, saves the
  complete delta, and sends that saved payload plus the previous report to Gemini
  in one generation request. There is no incremental character limit, truncation
  or AI batching.
- Model metadata and token counting check the assembled prompt. If preflight is
  unavailable, generation still receives the full request. Only confirmed input
  context overflow requests a fresh full audit. Rate limits, authentication errors
  and incomplete output retain the baseline and saved delta.
- Finalization atomically updates the report, folder projection, diff status,
  baseline SHA and version. Stale competing writes fail. Duplicate completion
  returns the committed result only while still current. Optional per-file
  snapshots never determine the baseline. A no-change window skips Gemini.
- Tracking survives deletion/archival of imported assets until the workspace is
  deleted. Tables permit owner-only reads; mutation RPCs require the backend
  service role and validate workspace ownership. Saved diff payloads are immutable.

## Error contract

Responses include a stable `code` and readable `detail`.

| Code | Behavior |
| --- | --- |
| `BASELINE_REQUIRED` | First/legacy verification needs a full audit. |
| `GEMINI_CONTEXT_OVERFLOW` | Complete input exceeds model capacity; run a full audit. |
| `BASELINE_UNAVAILABLE` | Historical commit unavailable; retain existing state. |
| `VERIFY_CONFLICT` | Competing audit changed the baseline; retry Verify. |
| `REPOSITORY_BINDING_CONFLICT` | Workspace repository/ref differs from its binding. |
| `INCOMPLETE_DIFF`, `INCOMPLETE_BASELINE` | Required content or audit results missing; retain baseline. |
| `GITHUB_AUTH_REQUIRED` | Reconnect GitHub with repository read access. |
| `GITHUB_RATE_LIMITED`, `GEMINI_RATE_LIMITED` | Retry later without resetting the baseline. |
| `GEMINI_AUTH_FAILED`, `GEMINI_UNAVAILABLE`, `GEMINI_INVALID_RESPONSE`, `GEMINI_INCOMPLETE_RESPONSE` | Provider failure; retain baseline and saved delta. |
| `TRACKING_UNAVAILABLE`, `DIFF_PERSISTENCE_FAILED` | Repair configuration or retry persistence. |

The frontend falls back only for `BASELINE_REQUIRED` and `GEMINI_CONTEXT_OVERFLOW`,
rather than treating every HTTP 409 as a reset request.

## Validation

With Python dependencies installed and test-only dummy provider keys if needed
for backend client construction (all test provider calls are mocked):

```text
python -m unittest backend.test_github_diff_service backend.test_github_diff_integration backend.test_gemini_audit_prompts backend.test_github_workspace_sync -v
```

`backend/test_github_diff_migration.mjs` runs the migration in disposable PostgreSQL
using `@electric-sql/pglite`. Install it into a separate validation directory and
set `PGLITE_MODULE_PATH` to its `dist/index.js`, or install it in the Node module
search path, then run:

```text
node backend/test_github_diff_migration.mjs
npm run lint
npx tsc --noEmit
npm run build
npm run dev
```

SQL checks exercise rollback, duplicate/stale completion, immutable history,
owner isolation and service-only RPC grants. Python checks cover large intact
prompts, physical context overflow, incomplete comparisons and deleted workspaces.
Local checks do not apply the remote migration or validate live Gemini credentials.
