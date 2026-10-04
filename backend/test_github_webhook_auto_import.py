import sys
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, patch


def install_google_genai_test_stub():
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
class GitHubWebhookAutoImportTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def repository_payload():
        return {
            "repository": {
                "full_name": "owner/new-repository",
                "html_url": "https://github.com/owner/new-repository",
                "default_branch": "main",
                "private": False,
                "owner": {"id": 42, "login": "owner"},
            },
            "sender": {"id": 42, "login": "owner"},
        }

    async def test_repository_created_imports_tree_without_pending_imports(self):
        context = main.GitHubWorkspaceContext(user_id="user-1", is_public=True)
        service_client = object()
        with patch.object(main, "get_supabase_service_client", return_value=service_client), patch.object(
            main, "_resolve_repository_workspace_context", AsyncMock(return_value=context)
        ) as resolve_workspace, patch.object(
            main, "_repository_is_actively_tracked", AsyncMock(return_value=False)
        ), patch.object(
            main, "get_persisted_github_connection_token", AsyncMock(return_value="token")
        ), patch.object(
            main, "fetch_github_branch_head_commit", AsyncMock(return_value="a" * 40)
        ), patch.object(
            main,
            "fetch_github_repository_tree_paths",
            AsyncMock(return_value=(["README.md", "src/app.py", "src/app.test.py"], False)),
        ), patch.object(
            main,
            "_build_github_folder_hierarchy",
            AsyncMock(return_value={"": "folder-1", "README.md": "folder-1", "src/app.py": "folder-2"}),
        ), patch.object(
            main, "download_github_raw_file", AsyncMock(return_value=(b"source", "text/plain"))
        ), patch.object(main, "_create_workspace_asset", AsyncMock(return_value=1)) as create_asset, patch.object(
            main, "_create_github_repository_placeholder", AsyncMock(return_value=1)
        ) as create_placeholder:
            result = await main.process_github_repository_created_event(
                self.repository_payload(),
                supabase_client=object(),
            )

        self.assertEqual(result.repository, "owner/new-repository")
        self.assertEqual(result.commit_sha, "a" * 40)
        self.assertEqual(result.trackable_files, 2)
        self.assertEqual(result.created_records, 2)
        self.assertEqual(create_asset.await_count, 2)
        create_placeholder.assert_not_awaited()
        self.assertIs(resolve_workspace.await_args.args[0], service_client)

    async def test_empty_repository_registers_a_placeholder_workspace(self):
        context = main.GitHubWorkspaceContext(user_id="user-1", is_public=True)
        with patch.object(main, "get_supabase_service_client", return_value=object()), patch.object(
            main, "_resolve_repository_workspace_context", AsyncMock(return_value=context)
        ), patch.object(
            main, "_repository_is_actively_tracked", AsyncMock(return_value=False)
        ), patch.object(
            main, "get_persisted_github_connection_token", AsyncMock(return_value="token")
        ), patch.object(
            main, "fetch_github_branch_head_commit", AsyncMock(return_value="b" * 40)
        ), patch.object(main, "fetch_github_repository_tree_paths", AsyncMock(return_value=([], False))), patch.object(
            main, "_build_github_folder_hierarchy", AsyncMock(return_value={"": "folder-1"})
        ), patch.object(main, "_create_workspace_asset", AsyncMock(return_value=1)) as create_asset, patch.object(
            main, "_create_github_repository_placeholder", AsyncMock(return_value=1)
        ) as create_placeholder:
            result = await main.process_github_repository_created_event(
                self.repository_payload(),
                supabase_client=object(),
            )

        self.assertEqual(result.created_records, 1)
        create_asset.assert_not_awaited()
        create_placeholder.assert_awaited_once()

    async def test_duplicate_repository_folder_stops_before_assets_or_placeholder(self):
        context = main.GitHubWorkspaceContext(user_id="user-1", is_public=True)
        service_client = object()
        with patch.object(main, "get_supabase_service_client", return_value=service_client), patch.object(
            main, "_resolve_repository_workspace_context", AsyncMock(return_value=context)
        ), patch.object(
            main, "_repository_is_actively_tracked", AsyncMock(return_value=False)
        ), patch.object(
            main, "get_persisted_github_connection_token", AsyncMock(return_value="token")
        ), patch.object(
            main, "fetch_github_branch_head_commit", AsyncMock(return_value="d" * 40)
        ), patch.object(
            main, "fetch_github_repository_tree_paths", AsyncMock(return_value=(["src/app.py"], False))
        ), patch.object(
            main,
            "_build_github_folder_hierarchy",
            AsyncMock(side_effect=main.GitHubWorkspaceAlreadyExists("folder-existing")),
        ) as build_hierarchy, patch.object(
            main, "_create_workspace_asset", AsyncMock(return_value=1)
        ) as create_asset, patch.object(
            main, "_create_github_repository_placeholder", AsyncMock(return_value=1)
        ) as create_placeholder:
            result = await main.process_github_repository_created_event(self.repository_payload())

        self.assertEqual(result.created_records, 0)
        self.assertEqual(result.failed_files, 0)
        create_asset.assert_not_awaited()
        create_placeholder.assert_not_awaited()
        self.assertEqual(build_hierarchy.await_args.kwargs["stop_on_existing_root"], True)

    async def test_first_push_updates_placeholder_metadata_without_an_audit(self):
        commit_sha = "c" * 40
        placeholder = {
            "id": "placeholder-1",
            "user_id": "user-1",
            "folder_id": "folder-1",
            "github_ref": None,
            "github_commit_sha": None,
        }

        class Query:
            def update(self, payload):
                self.payload = payload
                return self

            def eq(self, *_args):
                return self

            def execute(self):
                return SimpleNamespace(data=[{"id": "placeholder-1"}])

        class SupabaseClient:
            def __init__(self):
                self.query = Query()

            def table(self, table_name):
                self.table_name = table_name
                return self.query

        payload = {
            **self.repository_payload(),
            "after": commit_sha,
            "ref": "refs/heads/main",
            "commits": [],
        }
        payload["repository"]["default_branch"] = None
        client = SupabaseClient()
        workspace_context = main.GitHubWorkspaceContext(user_id="user-1", is_public=True)
        with patch.object(main, "_load_repository_assets", AsyncMock(return_value=[placeholder])), patch.object(
            main, "_resolve_repository_workspace_context", AsyncMock(return_value=workspace_context)
        ), patch.object(
            main,
            "_load_github_repository_root_folders",
            AsyncMock(return_value=[{"id": "folder-1", "user_id": "user-1"}]),
        ), patch.object(
            main, "_update_github_workspace_folder_push_metadata", AsyncMock(return_value=1)
        ) as update_folder_metadata, patch.object(
            main, "_get_repository_sync_access_token", AsyncMock(return_value=None)
        ), patch.object(main, "_record_push_notification_activity", AsyncMock()) as record_notification_activity, patch.object(
            main, "run_incremental_audit", AsyncMock()
        ) as run_incremental_audit:
            result = await main.process_github_push_event(
                payload,
                supabase_client=client,
            )

        self.assertEqual(result.updated_records, 2)
        self.assertEqual(client.table_name, "projects")
        self.assertEqual(client.query.payload["github_ref"], "main")
        self.assertEqual(client.query.payload["github_commit_sha"], commit_sha)
        update_folder_metadata.assert_awaited_once_with(
            client,
            folders=[{"id": "folder-1", "user_id": "user-1"}],
            branch="main",
            commit_sha=commit_sha,
        )
        record_notification_activity.assert_awaited_once_with(
            client,
            payload=payload,
            repository="owner/new-repository",
            user_ids={"user-1"},
            access_token=None,
            workspace_ids={"folder-1"},
        )
        run_incremental_audit.assert_not_awaited()

    def test_installation_account_is_an_owner_lookup_candidate(self):
        candidates = main._github_identity_candidates(
            {"installation": {"account": {"id": 77, "login": "installed-owner"}}}
        )
        self.assertEqual(candidates["github_user_id"], ["77"])
        self.assertEqual(candidates["github_username"], ["installed-owner"])

    def test_project_lifecycle_reads_the_first_returned_folder_id(self):
        folder, notification = main._project_lifecycle_result(
            SimpleNamespace(
                data=[
                    {
                        "folder": {"id": "folder-1", "name": "new-repository"},
                        "notification": {"id": "notification-1"},
                    }
                ]
            )
        )
        self.assertEqual(folder["id"], "folder-1")
        self.assertEqual(notification["id"], "notification-1")

    def test_project_lifecycle_accepts_a_uuid_scalar_rpc_result(self):
        folder_id = "a6e29c7d-862a-48e8-9ecf-3ba75fc5e5e2"
        folder, notification = main._project_lifecycle_result(
            SimpleNamespace(data=folder_id)
        )
        self.assertEqual(folder["id"], folder_id)
        self.assertEqual(notification, {})

    async def test_direct_folder_insert_selects_and_reads_the_first_returned_id(self):
        class Query:
            def __init__(self):
                self.select_called = False

            def insert(self, _payload):
                return self

            def select(self):
                self.select_called = True
                return self

            def execute(self):
                return SimpleNamespace(data=[{"id": "folder-1", "name": "nested"}])

        class SupabaseClient:
            def __init__(self):
                self.query = Query()

            def table(self, table_name):
                self.table_name = table_name
                return self.query

        client = SupabaseClient()
        folder = await main._create_project_folder(
            client,
            user_id="user-1",
            folder_name="nested",
            parent_id="folder-parent",
            source_supported=True,
            parent_id_supported=True,
        )
        self.assertEqual(folder["id"], "folder-1")
        self.assertEqual(client.table_name, "project_folders")
        self.assertTrue(client.query.select_called)

    async def test_empty_folder_insert_response_reuses_duplicate_project_folder(self):
        class Query:
            def insert(self, _payload):
                return self

            def select(self):
                return self

            def execute(self):
                return SimpleNamespace(data={})

        class SupabaseClient:
            def __init__(self):
                self.query = Query()

            def table(self, table_name):
                self.table_name = table_name
                return self.query

        client = SupabaseClient()
        existing_folder = {"id": "folder-existing", "name": "new-repository"}
        with patch.object(
            main,
            "_find_existing_project_folder_after_duplicate_response",
            AsyncMock(return_value=existing_folder),
        ) as find_existing:
            folder = await main._create_project_folder(
                client,
                user_id="user-1",
                folder_name="new-repository",
                parent_id=None,
                source_supported=True,
                parent_id_supported=True,
            )

        self.assertEqual(client.table_name, "project_folders")
        self.assertEqual(folder, existing_folder)
        find_existing.assert_awaited_once()

    def test_webhook_module_has_no_pending_imports_dependency(self):
        with open(main.__file__, encoding="utf-8") as source_file:
            self.assertNotIn("pending_imports", source_file.read())


if __name__ == "__main__":
    unittest.main()
