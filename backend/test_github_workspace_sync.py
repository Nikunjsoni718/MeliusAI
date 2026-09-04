import unittest
from unittest.mock import AsyncMock, patch

try:
    from backend import main
except ModuleNotFoundError as error:
    main = None
    BACKEND_IMPORT_ERROR = str(error)
else:
    BACKEND_IMPORT_ERROR = ""


@unittest.skipIf(main is None, f"Backend dependencies are unavailable: {BACKEND_IMPORT_ERROR}")
class GitHubWorkspaceSyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_first_import_creates_only_real_files_for_testing_2(self):
        created_assets: list[dict[str, object]] = []
        workspace_context = main.GitHubWorkspaceContext(
            user_id="user-testing-2",
            is_public=True,
        )
        changes = main.GitHubPushChanges(
            added=frozenset({"src/index.ts", "lib/worker.py"}),
            modified=frozenset(),
            removed=frozenset(),
        )

        async def record_created_asset(*_args, **kwargs):
            created_assets.append(kwargs)
            return 1

        with (
            patch.object(main, "get_github_repository_full_name", return_value="octo/testing_2"),
            patch.object(main, "get_github_after_sha", return_value="a" * 40),
            patch.object(main, "extract_github_push_changes", return_value=changes),
            patch.object(main, "_get_workspace_assets_table_name", return_value="projects"),
            patch.object(main, "_get_storage_bucket_name", return_value="vault"),
            patch.object(
                main,
                "_get_github_repository_url",
                return_value="https://github.com/octo/testing_2",
            ),
            patch.object(main, "_load_repository_assets", new=AsyncMock(return_value=[])),
            patch.object(
                main,
                "_resolve_repository_workspace_context",
                new=AsyncMock(return_value=workspace_context),
            ),
            patch.object(
                main,
                "_build_github_folder_hierarchy",
                new=AsyncMock(
                    return_value={
                        "src/index.ts": "folder-src",
                        "lib/worker.py": "folder-lib",
                    }
                ),
            ),
            patch.object(
                main,
                "download_github_raw_file",
                new=AsyncMock(return_value=(b"export default {};", "text/plain")),
            ),
            patch.object(main, "_create_workspace_asset", new=record_created_asset),
            patch.object(main, "_get_github_access_token", return_value=None),
        ):
            result = await main.process_github_push_event({}, supabase_client=object())

        self.assertEqual(result.created_records, 2)
        self.assertEqual(result.updated_records, 0)
        self.assertEqual(
            {asset["file_path"] for asset in created_assets},
            {"src/index.ts", "lib/worker.py"},
        )
        self.assertTrue(all(asset["folder_id"] for asset in created_assets))
        self.assertTrue(all(asset["workspace_context"] is workspace_context for asset in created_assets))
        self.assertNotIn("testing_2", {asset["file_path"] for asset in created_assets})


if __name__ == "__main__":
    unittest.main()
