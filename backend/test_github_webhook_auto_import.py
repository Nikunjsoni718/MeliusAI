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
        with patch.object(main, "_resolve_repository_workspace_context", AsyncMock(return_value=context)), patch.object(
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

    async def test_empty_repository_registers_a_placeholder_workspace(self):
        context = main.GitHubWorkspaceContext(user_id="user-1", is_public=True)
        with patch.object(main, "_resolve_repository_workspace_context", AsyncMock(return_value=context)), patch.object(
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

    def test_installation_account_is_an_owner_lookup_candidate(self):
        candidates = main._github_identity_candidates(
            {"installation": {"account": {"id": 77, "login": "installed-owner"}}}
        )
        self.assertEqual(candidates["github_user_id"], ["77"])
        self.assertEqual(candidates["github_username"], ["installed-owner"])

    def test_webhook_module_has_no_pending_imports_dependency(self):
        with open(main.__file__, encoding="utf-8") as source_file:
            self.assertNotIn("pending_imports", source_file.read())


if __name__ == "__main__":
    unittest.main()
