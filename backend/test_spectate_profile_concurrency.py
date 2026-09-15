import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi.security import HTTPAuthorizationCredentials

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


class FakeRequest:
    def __init__(self, view=None):
        self.query_params = {} if view is None else {"view": view}
        self.state = SimpleNamespace()


def response_json(response):
    return json.loads(response.body.decode("utf-8"))


@unittest.skipIf(main is None, f"Backend dependencies are unavailable: {BACKEND_IMPORT_ERROR}")
class SpectateProfileQueryTests(unittest.IsolatedAsyncioTestCase):
    async def test_dashboard_asset_reads_are_concurrent(self):
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
                [{"id": "project-1", "title": "standalone.py", "score": 84, "created_at": "2026-01-03T00:00:00Z"}]
            ),
            "folder_files": FakeSupabaseResponse(
                [{"id": "project-2", "title": "nested.py", "folder_id": "folder-1", "score": 72, "created_at": "2026-01-01T00:00:00Z"}]
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
            profile_task = asyncio.create_task(main.spectate_profile("member", FakeRequest(), None))
            started = {
                await asyncio.wait_for(reads_started.get(), timeout=0.5),
                await asyncio.wait_for(reads_started.get(), timeout=0.5),
                await asyncio.wait_for(reads_started.get(), timeout=0.5),
            }
            self.assertEqual(started, set(release_reads))
            for release in release_reads.values():
                release.set()
            payload = await profile_task

        self.assertEqual([project["id"] for project in payload["projects"]], ["project-1"])
        self.assertEqual(payload["project_folders"][0]["file_count"], 1)
        self.assertEqual(payload["project_folders"][0]["nested_projects"][0]["id"], "project-2")
        self.assertEqual(payload["ratings"][0]["project_id"], "project-1")

    async def test_missing_and_private_profiles_return_the_safe_404_body(self):
        async def missing_query(_operation, *, operation_name):
            self.assertEqual(operation_name, "profile")
            return FakeSupabaseResponse([])

        with (
            patch.object(main, "get_supabase_spectate_client", return_value=object()),
            patch.object(main, "run_spectate_profile_query", new=missing_query),
        ):
            missing_response = await main.spectate_profile("missing", FakeRequest(), None)

        self.assertEqual(missing_response.status_code, 404)
        self.assertEqual(response_json(missing_response), {"error": "Profile not found or private"})

        async def private_query(_operation, *, operation_name):
            self.assertEqual(operation_name, "profile")
            return FakeSupabaseResponse(
                [{"id": "profile-1", "username": "private", "public_profile_enabled": False}]
            )

        with (
            patch.object(main, "get_supabase_spectate_client", return_value=object()),
            patch.object(main, "run_spectate_profile_query", new=private_query),
        ):
            private_response = await main.spectate_profile("private", FakeRequest(), None)

        self.assertEqual(private_response.status_code, 404)
        self.assertEqual(response_json(private_response), {"error": "Profile not found or private"})

    async def test_upstream_and_aggregate_timeouts_return_a_structured_503(self):
        async def failed_query(_operation, *, operation_name):
            if operation_name == "profile":
                return FakeSupabaseResponse([{"id": "profile-1", "username": "member"}])
            raise main.SpectateProfileUpstreamError(operation_name)

        with (
            patch.object(main, "get_supabase_spectate_client", return_value=object()),
            patch.object(main, "run_spectate_profile_query", new=failed_query),
        ):
            response = await main.spectate_profile("member", FakeRequest(), None)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response_json(response), {"error": "Profile data is temporarily unavailable"})

        never_finishes = asyncio.Event()

        async def stalled_query(_operation, *, operation_name):
            if operation_name == "profile":
                return FakeSupabaseResponse([{"id": "profile-1", "username": "member"}])
            await never_finishes.wait()
            raise AssertionError("The stalled query should be cancelled before it returns.")

        with (
            patch.object(main, "get_supabase_spectate_client", return_value=object()),
            patch.object(main, "run_spectate_profile_query", new=stalled_query),
            patch.object(main, "SPECTATE_PROFILE_QUERY_TIMEOUT_SECONDS", 0.01),
        ):
            timed_out_response = await main.spectate_profile("member", FakeRequest(), None)

        self.assertEqual(timed_out_response.status_code, 503)
        self.assertEqual(response_json(timed_out_response), {"error": "Profile data is temporarily unavailable"})

    async def test_retry_and_optional_auth_timeout_degrade_safely(self):
        attempts = 0

        def temporary_operation():
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise httpx.ConnectError("temporary Supabase failure")
            return "recovered"

        self.assertEqual(
            await main.run_spectate_profile_query(temporary_operation, operation_name="profile"),
            "recovered",
        )
        self.assertEqual(attempts, 2)

        async def unavailable_auth(_operation, *, operation_name):
            self.assertEqual(operation_name, "auth_user")
            raise main.SpectateProfileUpstreamError(operation_name)

        token = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not-a-real-token")
        with patch.object(main, "run_spectate_profile_query", new=unavailable_auth):
            user_id, status = await main.resolve_spectator_request_user(FakeRequest(), token, object())

        self.assertIsNone(user_id)
        self.assertEqual(status, "unavailable")

    def test_missing_notification_preferences_default_to_enabled_but_preserve_opt_outs(self):
        legacy_profile = {"audit_alerts_enabled": None}
        main.normalize_spectator_profile_preferences(legacy_profile)

        self.assertIs(legacy_profile["audit_alerts_enabled"], True)
        self.assertIs(legacy_profile["opportunity_match_alerts_enabled"], True)

        opted_out_profile = {
            "audit_alerts_enabled": False,
            "opportunity_match_alerts_enabled": False,
        }
        main.normalize_spectator_profile_preferences(opted_out_profile)

        self.assertIs(opted_out_profile["audit_alerts_enabled"], False)
        self.assertIs(opted_out_profile["opportunity_match_alerts_enabled"], False)

    def test_legacy_null_preferences_use_safe_defaults_and_redact_visitors(self):
        profile = {
            "email": "member@example.com",
            "public_profile_enabled": None,
            "public_scorecard_enabled": None,
            "public_contact_email_enabled": None,
            "default_asset_is_public": None,
            "audit_alerts_enabled": None,
            "opportunity_match_alerts_enabled": None,
        }
        assets = [{"score": 88, "audit_summary": "private audit"}]

        scorecards_visible = main.apply_spectator_profile_preferences(
            profile,
            is_owner=False,
            assets=assets,
        )

        self.assertTrue(scorecards_visible)
        self.assertIsNone(profile["email"])
        self.assertEqual(assets[0]["score"], 88)
        for preference_name in main.SPECTATOR_PREFERENCE_DEFAULTS:
            self.assertNotIn(preference_name, profile)

        hidden_scorecard_profile = {
            "email": "member@example.com",
            "public_scorecard_enabled": False,
            "public_contact_email_enabled": True,
        }
        hidden_scorecard_assets = [{"score": 66, "audit_summary": "private audit"}]
        self.assertFalse(
            main.apply_spectator_profile_preferences(
                hidden_scorecard_profile,
                is_owner=False,
                assets=hidden_scorecard_assets,
            )
        )
        self.assertEqual(hidden_scorecard_profile["email"], "member@example.com")
        self.assertNotIn("score", hidden_scorecard_assets[0])
        self.assertNotIn("audit_summary", hidden_scorecard_assets[0])


if __name__ == "__main__":
    unittest.main()
