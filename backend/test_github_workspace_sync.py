import asyncio
import unittest
from contextlib import ExitStack
from unittest.mock import AsyncMock, call, patch

try:
    from backend import main
except ModuleNotFoundError as error:
    main = None
    BACKEND_IMPORT_ERROR = str(error)
else:
    BACKEND_IMPORT_ERROR = ""


REAL_ASYNCIO_SLEEP = asyncio.sleep


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

    async def test_syncs_changed_files_one_at_a_time_with_delay_and_logs(self):
        workspace_context = main.GitHubWorkspaceContext(
            user_id="user-testing-2",
            is_public=True,
        )
        changes = main.GitHubPushChanges(
            added=frozenset({"a.py", "b.py"}),
            modified=frozenset(),
            removed=frozenset(),
        )
        first_download_started = asyncio.Event()
        allow_first_download_to_finish = asyncio.Event()
        second_download_started = asyncio.Event()
        downloaded_paths: list[str] = []
        created_paths: list[str] = []
        pause = AsyncMock()

        async def download_one_file(*_args, file_path, **_kwargs):
            downloaded_paths.append(file_path)
            if file_path == "a.py":
                first_download_started.set()
                await allow_first_download_to_finish.wait()
            else:
                second_download_started.set()
            return b"print('ok')", "text/plain"

        async def record_created_asset(*_args, **kwargs):
            created_paths.append(kwargs["file_path"])
            return 1

        with self.assertLogs(main.logger, level="INFO") as logs, ExitStack() as stack:
            stack.enter_context(patch.object(main, "get_github_repository_full_name", return_value="octo/testing_2"))
            stack.enter_context(patch.object(main, "get_github_after_sha", return_value="a" * 40))
            stack.enter_context(patch.object(main, "extract_github_push_changes", return_value=changes))
            stack.enter_context(patch.object(main, "_get_workspace_assets_table_name", return_value="projects"))
            stack.enter_context(patch.object(main, "_get_storage_bucket_name", return_value="vault"))
            stack.enter_context(patch.object(main, "_get_github_repository_url", return_value="https://github.com/octo/testing_2"))
            stack.enter_context(patch.object(main, "_load_repository_assets", new=AsyncMock(return_value=[])))
            stack.enter_context(patch.object(main, "_resolve_repository_workspace_context", new=AsyncMock(return_value=workspace_context)))
            stack.enter_context(patch.object(main, "_build_github_folder_hierarchy", new=AsyncMock(return_value={"a.py": "folder-a", "b.py": "folder-b"})))
            stack.enter_context(patch.object(main, "download_github_raw_file", new=download_one_file))
            stack.enter_context(patch.object(main, "_create_workspace_asset", new=record_created_asset))
            stack.enter_context(patch.object(main, "_get_github_access_token", return_value=None))
            stack.enter_context(patch.object(main.asyncio, "sleep", new=pause))

            task = asyncio.create_task(
                main.process_github_push_event({}, supabase_client=object(), http_client=object())
            )
            await first_download_started.wait()
            await REAL_ASYNCIO_SLEEP(0)
            self.assertFalse(second_download_started.is_set())
            allow_first_download_to_finish.set()
            result = await task

        self.assertEqual(result.created_records, 2)
        self.assertEqual(downloaded_paths, ["a.py", "b.py"])
        self.assertEqual(created_paths, ["a.py", "b.py"])
        pause.assert_awaited_once_with(1)
        self.assertIn(f"WEBHOOK RECEIVED: Processing commit {'a' * 40}", "\n".join(logs.output))
        self.assertIn("SEQUENTIAL PROCESSING: Auditing file a.py (1 of 2)", "\n".join(logs.output))
        self.assertIn("SEQUENTIAL PROCESSING: Auditing file b.py (2 of 2)", "\n".join(logs.output))

    async def test_failed_file_does_not_stop_later_sequential_syncs(self):
        workspace_context = main.GitHubWorkspaceContext(
            user_id="user-testing-2",
            is_public=True,
        )
        changes = main.GitHubPushChanges(
            added=frozenset({"a.py", "b.py", "c.py"}),
            modified=frozenset(),
            removed=frozenset(),
        )
        downloaded_paths: list[str] = []
        created_paths: list[str] = []
        pause = AsyncMock()

        async def download_one_file(*_args, file_path, **_kwargs):
            downloaded_paths.append(file_path)
            if file_path == "b.py":
                raise RuntimeError("GitHub temporarily unavailable")
            return b"print('ok')", "text/plain"

        async def record_created_asset(*_args, **kwargs):
            created_paths.append(kwargs["file_path"])
            return 1

        with ExitStack() as stack:
            stack.enter_context(patch.object(main, "get_github_repository_full_name", return_value="octo/testing_2"))
            stack.enter_context(patch.object(main, "get_github_after_sha", return_value="a" * 40))
            stack.enter_context(patch.object(main, "extract_github_push_changes", return_value=changes))
            stack.enter_context(patch.object(main, "_get_workspace_assets_table_name", return_value="projects"))
            stack.enter_context(patch.object(main, "_get_storage_bucket_name", return_value="vault"))
            stack.enter_context(patch.object(main, "_get_github_repository_url", return_value="https://github.com/octo/testing_2"))
            stack.enter_context(patch.object(main, "_load_repository_assets", new=AsyncMock(return_value=[])))
            stack.enter_context(patch.object(main, "_resolve_repository_workspace_context", new=AsyncMock(return_value=workspace_context)))
            stack.enter_context(patch.object(main, "_build_github_folder_hierarchy", new=AsyncMock(return_value={"a.py": "folder-a", "b.py": "folder-b", "c.py": "folder-c"})))
            stack.enter_context(patch.object(main, "download_github_raw_file", new=download_one_file))
            stack.enter_context(patch.object(main, "_create_workspace_asset", new=record_created_asset))
            stack.enter_context(patch.object(main, "_get_github_access_token", return_value=None))
            stack.enter_context(patch.object(main.asyncio, "sleep", new=pause))

            result = await main.process_github_push_event(
                {}, supabase_client=object(), http_client=object()
            )

        self.assertEqual(downloaded_paths, ["a.py", "b.py", "c.py"])
        self.assertEqual(created_paths, ["a.py", "c.py"])
        self.assertEqual(result.created_records, 2)
        self.assertEqual(result.failed_files, 1)
        self.assertEqual(pause.await_args_list, [call(1), call(1)])


if __name__ == "__main__":
    unittest.main()
