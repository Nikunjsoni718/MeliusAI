import asyncio
import unittest
from unittest.mock import patch

import httpx

try:
    from backend import main
except ModuleNotFoundError as error:
    main = None
    BACKEND_IMPORT_ERROR = str(error)
else:
    BACKEND_IMPORT_ERROR = ""


class FakeSupabaseResponse:
    def __init__(self, data):
        self.data = data


@unittest.skipIf(main is None, f"Backend dependencies are unavailable: {BACKEND_IMPORT_ERROR}")
class SpectateProfileConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_independent_dashboard_asset_reads_start_concurrently(self):
        reads_started: set[str] = set()
        all_asset_reads_started = asyncio.Event()
        release_asset_reads = asyncio.Event()

        responses = {
            "profile": FakeSupabaseResponse(
                [{"id": "profile-1", "username": "member", "email": "member@example.com"}]
            ),
            "project_folders": FakeSupabaseResponse(
                [{"id": "folder-1", "name": "workspace", "created_at": "2026-01-02T00:00:00Z"}]
            ),
            "standalone_projects": FakeSupabaseResponse(
                [
                    {
                        "id": "project-1",
                        "title": "standalone.py",
                        "score": 84,
                        "created_at": "2026-01-03T00:00:00Z",
                    }
                ]
            ),
            "folder_files": FakeSupabaseResponse(
                [
                    {
                        "id": "project-2",
                        "title": "nested.py",
                        "folder_id": "folder-1",
                        "score": 72,
                        "created_at": "2026-01-01T00:00:00Z",
                    }
                ]
            ),
        }

        async def query_stub(_operation, *, operation_name):
            if operation_name == "profile":
                return responses[operation_name]

            reads_started.add(operation_name)
            if len(reads_started) == 3:
                all_asset_reads_started.set()

            await release_asset_reads.wait()
            return responses[operation_name]

        with (
            patch.object(main, "get_supabase_spectate_client", return_value=object()),
            patch.object(main, "run_spectate_profile_query", new=query_stub),
        ):
            profile_task = asyncio.create_task(main.spectate_profile("member", object(), None))

            await asyncio.wait_for(all_asset_reads_started.wait(), timeout=0.5)
            self.assertSetEqual(
                reads_started,
                {"project_folders", "standalone_projects", "folder_files"},
            )

            release_asset_reads.set()
            payload = await profile_task

        self.assertEqual([project["id"] for project in payload["projects"]], ["project-1"])
        self.assertEqual(payload["project_folders"][0]["file_count"], 1)
        self.assertEqual(payload["project_folders"][0]["nested_projects"][0]["id"], "project-2")
        self.assertEqual(payload["ratings"][0]["project_id"], "project-1")

    async def test_partial_asset_failure_keeps_the_other_dashboard_sources(self):
        responses = {
            "profile": FakeSupabaseResponse(
                [{"id": "profile-1", "username": "member", "email": "member@example.com"}]
            ),
            "project_folders": FakeSupabaseResponse(
                [{"id": "folder-1", "name": "workspace", "created_at": "2026-01-02T00:00:00Z"}]
            ),
            "standalone_projects": FakeSupabaseResponse(
                [{"id": "project-1", "title": "standalone.py", "score": 84}]
            ),
        }

        async def query_stub(_operation, *, operation_name):
            if operation_name == "folder_files":
                raise httpx.ConnectError("temporary Supabase failure")
            return responses[operation_name]

        with (
            patch.object(main, "get_supabase_spectate_client", return_value=object()),
            patch.object(main, "run_spectate_profile_query", new=query_stub),
        ):
            payload = await main.spectate_profile("member", object(), None)

        self.assertTrue(payload["degraded"])
        self.assertEqual(payload["unavailableSources"], ["folder_files"])
        self.assertEqual([project["id"] for project in payload["projects"]], ["project-1"])
        self.assertEqual(payload["project_folders"][0]["file_count"], 0)


if __name__ == "__main__":
    unittest.main()
