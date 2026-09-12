import asyncio
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException

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
class SpectateProfileSequentialQueryTests(unittest.IsolatedAsyncioTestCase):
    async def test_dashboard_asset_reads_finish_in_order(self):
        reads_started: asyncio.Queue[str] = asyncio.Queue()
        release_reads = {
            "project_folders": asyncio.Event(),
            "standalone_projects": asyncio.Event(),
            "folder_files": asyncio.Event(),
        }

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

            await reads_started.put(operation_name)
            await release_reads[operation_name].wait()
            return responses[operation_name]

        with (
            patch.object(main, "get_supabase_spectate_client", return_value=object()),
            patch.object(main, "run_spectate_profile_query", new=query_stub),
        ):
            profile_task = asyncio.create_task(main.spectate_profile("member", object(), None))

            self.assertEqual(await asyncio.wait_for(reads_started.get(), timeout=0.5), "project_folders")
            self.assertTrue(reads_started.empty())
            release_reads["project_folders"].set()

            self.assertEqual(await asyncio.wait_for(reads_started.get(), timeout=0.5), "standalone_projects")
            self.assertTrue(reads_started.empty())
            release_reads["standalone_projects"].set()

            self.assertEqual(await asyncio.wait_for(reads_started.get(), timeout=0.5), "folder_files")
            self.assertTrue(reads_started.empty())
            release_reads["folder_files"].set()
            payload = await profile_task

        self.assertEqual([project["id"] for project in payload["projects"]], ["project-1"])
        self.assertEqual(payload["project_folders"][0]["file_count"], 1)
        self.assertEqual(payload["project_folders"][0]["nested_projects"][0]["id"], "project-2")
        self.assertEqual(payload["ratings"][0]["project_id"], "project-1")

    async def test_asset_query_failure_returns_a_stable_500(self):
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
            if operation_name == "standalone_projects":
                raise httpx.ConnectError("temporary Supabase failure")
            return responses[operation_name]

        with (
            patch.object(main, "get_supabase_spectate_client", return_value=object()),
            patch.object(main, "run_spectate_profile_query", new=query_stub),
        ):
            with self.assertRaises(HTTPException) as error_context:
                await main.spectate_profile("member", object(), None)

        self.assertEqual(error_context.exception.status_code, 500)
        self.assertEqual(error_context.exception.detail, "Unable to load profile data.")

    async def test_stalled_asset_query_respects_the_aggregate_timeout(self):
        never_finishes = asyncio.Event()

        async def query_stub(_operation, *, operation_name):
            if operation_name == "profile":
                return FakeSupabaseResponse([{"id": "profile-1", "username": "member"}])
            await never_finishes.wait()
            raise AssertionError("The stalled query should be cancelled before it returns.")

        with (
            patch.object(main, "get_supabase_spectate_client", return_value=object()),
            patch.object(main, "run_spectate_profile_query", new=query_stub),
            patch.object(main, "SPECTATE_PROFILE_QUERY_TIMEOUT_SECONDS", 0.01),
        ):
            with self.assertRaises(HTTPException) as error_context:
                await main.spectate_profile("member", object(), None)

        self.assertEqual(error_context.exception.status_code, 500)
        self.assertEqual(error_context.exception.detail, "Unable to load profile data.")


if __name__ == "__main__":
    unittest.main()
