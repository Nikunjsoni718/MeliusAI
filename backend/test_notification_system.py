import unittest
import inspect
import os
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, Mock, patch

try:
    from backend import main
except ModuleNotFoundError as error:
    main = None
    BACKEND_IMPORT_ERROR = str(error)
else:
    BACKEND_IMPORT_ERROR = ""


@unittest.skipIf(main is None, f"Backend dependencies are unavailable: {BACKEND_IMPORT_ERROR}")
class NotificationSystemTests(unittest.IsolatedAsyncioTestCase):
    def test_notification_timing_uses_a_25_minute_cooldown_and_150_minute_batch(self):
        self.assertEqual(main.NOTIFICATION_COOLDOWN_MINUTES, 25)
        self.assertEqual(main.NOTIFICATION_EMAIL_BATCH_MINUTES, 150)

    async def test_cooldown_deadline_uses_25_minutes(self):
        query = Mock()
        query.upsert.return_value = query
        query.execute.return_value = SimpleNamespace(data=[])
        client = Mock()
        client.table.return_value = query
        committed_at = datetime(2026, 9, 17, 12, 0, tzinfo=timezone.utc)

        await main._schedule_repository_cooldown(
            client,
            user_id="user-a",
            repository="owner/repository",
            lines_changed=20,
            qualifying_commit_at=committed_at,
        )

        payload = query.upsert.call_args.args[0]
        self.assertEqual(payload["scheduled_at"], "2026-09-17T12:25:00+00:00")

    async def test_qualifying_push_logs_the_short_debounce_milestone(self):
        update = AsyncMock()
        schedule = AsyncMock()
        captured_logger = Mock()
        with (
            patch.object(main, "_update_repository_commit_tracking", new=update),
            patch.object(main, "calculate_notification_lines_changed", new=AsyncMock(return_value=20)),
            patch.object(main, "_schedule_repository_cooldown", new=schedule),
            patch.object(main, "logger", captured_logger),
        ):
            await main._record_push_notification_activity(
                object(),
                payload={"after": "a" * 40},
                repository="owner/repository",
                user_ids={"user-a"},
                access_token="token",
            )

        captured_logger.info.assert_called_once_with(
            "Started 25-minute debounce timer for owner/repository"
        )

    async def test_batch_deadline_uses_150_minutes(self):
        query = Mock()
        query.insert.return_value = query
        query.select.return_value = query
        query.execute.return_value = SimpleNamespace(data=[{"id": "batch-id"}])
        client = Mock()
        client.table.return_value = query
        started_at = datetime(2026, 9, 17, 12, 0, tzinfo=timezone.utc)

        await main._ensure_notification_email_batch(
            client,
            user_id="user-a",
            window_started_at=started_at,
        )

        payload = query.insert.call_args.args[0]
        self.assertEqual(payload["due_at"], "2026-09-17T14:30:00+00:00")

    def test_structured_notification_logs_are_absent_and_only_milestones_remain(self):
        source = Path(main.__file__).read_text(encoding="utf-8")
        self.assertNotIn("_notification_log", source)
        self.assertNotIn("notification.lifecycle", source)
        self.assertIn('logger.info(f"Started 25-minute debounce timer for {repository}")', source)
        self.assertIn('logger.info(f"Timer expired for {repository}: Desktop push queued")', source)
        self.assertIn('logger.info(f"Manual audit completed for {repository}: Timer bypassed")', source)

    def test_notification_cron_has_no_routine_success_logs_and_keeps_github_summary(self):
        self.assertNotIn("logger.info", inspect.getsource(main.process_notification_jobs))
        self.assertNotIn("logger.info", inspect.getsource(main._process_due_notification_batches))
        self.assertNotIn("logger.info", inspect.getsource(main._send_pending_web_push_deliveries))
        webhook_source = inspect.getsource(main.process_github_push_in_background)
        self.assertIn('"github_webhook.processed delivery_id=%s result=%s"', webhook_source)

    def test_timer_expiry_log_requires_at_least_one_queued_push(self):
        source = inspect.getsource(main._process_due_notification_cooldowns)
        self.assertIn("queued_pushes = await _dispatch_notification_web_push", source)
        self.assertIn("if queued_pushes:", source)
        self.assertIn('logger.info(f"Timer expired for {repository}: Desktop push queued")', source)

    async def test_expired_cooldown_logs_when_a_desktop_push_is_queued(self):
        now = datetime(2026, 9, 17, 12, 25, tzinfo=timezone.utc)
        cooldown = {
            "user_id": "user-a",
            "repository": "owner/repository",
            "lines_changed": 20,
            "last_qualifying_commit_at": "2026-09-17T12:00:00+00:00",
            "scheduled_at": "2026-09-17T12:25:00+00:00",
        }
        notification = {"id": "notification-id", "created_at": "2026-09-17T12:25:00+00:00"}
        captured_logger = Mock()
        with (
            patch.object(main, "_notification_timestamp", return_value=now),
            patch.object(main, "_run_supabase", new=AsyncMock(return_value=SimpleNamespace(data=[cooldown]))),
            patch.object(main, "_repository_tracking_rows", new=AsyncMock(return_value=[])),
            patch.object(main, "_insert_notification", new=AsyncMock(return_value=notification)),
            patch.object(main, "_ensure_notification_email_batch", new=AsyncMock()),
            patch.object(main, "_dispatch_notification_web_push", new=AsyncMock(return_value=1)),
            patch.object(main, "_delete_repository_cooldown", new=AsyncMock()),
            patch.object(main, "logger", captured_logger),
        ):
            result = await main._process_due_notification_cooldowns(object())

        self.assertEqual(result, {"created": 1, "suppressed": 0})
        captured_logger.info.assert_called_once_with(
            "Timer expired for owner/repository: Desktop push queued"
        )

    async def test_expired_cooldown_is_silent_without_a_subscribed_device(self):
        now = datetime(2026, 9, 17, 12, 25, tzinfo=timezone.utc)
        cooldown = {
            "user_id": "user-a",
            "repository": "owner/repository",
            "lines_changed": 20,
            "last_qualifying_commit_at": "2026-09-17T12:00:00+00:00",
            "scheduled_at": "2026-09-17T12:25:00+00:00",
        }
        notification = {"id": "notification-id", "created_at": "2026-09-17T12:25:00+00:00"}
        captured_logger = Mock()
        with (
            patch.object(main, "_notification_timestamp", return_value=now),
            patch.object(main, "_run_supabase", new=AsyncMock(return_value=SimpleNamespace(data=[cooldown]))),
            patch.object(main, "_repository_tracking_rows", new=AsyncMock(return_value=[])),
            patch.object(main, "_insert_notification", new=AsyncMock(return_value=notification)),
            patch.object(main, "_ensure_notification_email_batch", new=AsyncMock()),
            patch.object(main, "_dispatch_notification_web_push", new=AsyncMock(return_value=0)),
            patch.object(main, "_delete_repository_cooldown", new=AsyncMock()),
            patch.object(main, "logger", captured_logger),
        ):
            result = await main._process_due_notification_cooldowns(object())

        self.assertEqual(result, {"created": 1, "suppressed": 0})
        captured_logger.info.assert_not_called()

    def test_github_signature_requires_the_exact_signed_body(self):
        body = b'{"repository":"owner/repo"}'
        signature = "sha256=5373d5834d1abb98f867e9e741f91b4733c1054135679d4eec0b04fc84b3315e"
        self.assertTrue(main.verify_github_webhook_signature(body, signature, "webhook-secret"))
        self.assertFalse(main.verify_github_webhook_signature(body + b" ", signature, "webhook-secret"))
        self.assertFalse(main.verify_github_webhook_signature(body, None, "webhook-secret"))

    def test_notification_file_filter_excludes_docs_and_gitignore(self):
        self.assertTrue(main.is_notification_eligible_code_file("src/app.ts"))
        self.assertFalse(main.is_notification_eligible_code_file("README.md"))
        self.assertFalse(main.is_notification_eligible_code_file("notes.txt"))
        self.assertFalse(main.is_notification_eligible_code_file(".gitignore"))

    async def test_exact_fifteen_lines_starts_a_cooldown(self):
        update = AsyncMock()
        schedule = AsyncMock()
        with (
            patch.object(main, "_update_repository_commit_tracking", new=update),
            patch.object(main, "calculate_notification_lines_changed", new=AsyncMock(return_value=15)),
            patch.object(main, "_schedule_repository_cooldown", new=schedule),
        ):
            await main._record_push_notification_activity(
                object(),
                payload={"after": "a" * 40},
                repository="owner/repo",
                user_ids={"user-a"},
                access_token="token",
            )
        update.assert_awaited_once()
        schedule.assert_awaited_once()
        self.assertEqual(schedule.await_args.kwargs["lines_changed"], 15)

    async def test_small_push_updates_tracking_without_a_cooldown(self):
        update = AsyncMock()
        schedule = AsyncMock()
        with (
            patch.object(main, "_update_repository_commit_tracking", new=update),
            patch.object(main, "calculate_notification_lines_changed", new=AsyncMock(return_value=14)),
            patch.object(main, "_schedule_repository_cooldown", new=schedule),
        ):
            await main._record_push_notification_activity(
                object(),
                payload={"after": "a" * 40},
                repository="owner/repo",
                user_ids={"user-a"},
                access_token="token",
            )
        update.assert_awaited_once()
        schedule.assert_not_awaited()

    async def test_repositories_receive_independent_cooldowns(self):
        update = AsyncMock()
        schedule = AsyncMock()
        with (
            patch.object(main, "_update_repository_commit_tracking", new=update),
            patch.object(main, "calculate_notification_lines_changed", new=AsyncMock(return_value=20)),
            patch.object(main, "_schedule_repository_cooldown", new=schedule),
        ):
            await main._record_push_notification_activity(
                object(), payload={}, repository="owner/first", user_ids={"user-a"}, access_token="token"
            )
            await main._record_push_notification_activity(
                object(), payload={}, repository="owner/second", user_ids={"user-a"}, access_token="token"
            )
        self.assertEqual([call.kwargs["repository"] for call in schedule.await_args_list], ["owner/first", "owner/second"])

    async def test_audit_state_filter_treats_equal_timestamps_as_current(self):
        with patch.object(
            main,
            "_repository_tracking_rows",
            new=AsyncMock(return_value=[{"last_commit_at": "2026-09-16T00:00:00+00:00", "last_audit_at": "2026-09-16T00:00:00+00:00"}]),
        ):
            self.assertTrue(await main._repository_has_current_audit(object(), user_id="user-a", repository="owner/repo"))

    def test_batch_email_uses_single_and_digest_copy(self):
        single_subject, single_body = main._build_cooldown_batch_email(
            [{"project_id": "owner/repo", "metadata": {"lines_changed": 21}}]
        )
        digest_subject, digest_body = main._build_cooldown_batch_email(
            [
                {"project_id": "owner/repo", "metadata": {"lines_changed": 21}},
                {"project_id": "owner/second", "metadata": {"lines_changed": 33}},
            ]
        )
        self.assertEqual(single_subject, "Updates pending in owner/repo")
        self.assertIn("You shipped 21 lines to owner/repo", single_body)
        self.assertEqual(digest_subject, "Updates pending across multiple projects")
        self.assertIn("owner/repo and 1 other projects", digest_body)

    def test_batch_suppresses_opt_out_or_audited_empty_work(self):
        eligible = [{"project_id": "owner/repo", "metadata": {"lines_changed": 21}}]
        self.assertTrue(main._should_suppress_notification_batch(None, eligible))
        self.assertTrue(main._should_suppress_notification_batch({"audit_alerts_enabled": False}, eligible))
        self.assertTrue(main._should_suppress_notification_batch({"audit_alerts_enabled": True}, []))
        self.assertFalse(main._should_suppress_notification_batch({"audit_alerts_enabled": True}, eligible))

    async def test_resend_unverified_domain_skips_without_raising(self):
        class UnverifiedResendClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def post(self, *_args, **_kwargs):
                return SimpleNamespace(status_code=403, is_success=False, text="Domain is not verified")

        with (
            patch.dict(os.environ, {"RESEND_API_KEY": "key", "RESEND_FROM_EMAIL": "audit@example.com"}, clear=True),
            patch.object(main.httpx, "AsyncClient", return_value=UnverifiedResendClient()),
            self.assertLogs(main.logger, level="WARNING") as logs,
        ):
            result = await main._send_resend_email(
                recipient="developer@example.com",
                subject="Updates pending",
                text_body="Run your audit.",
                idempotency_key="batch-id",
            )

        self.assertIsNone(result)
        self.assertEqual(logs.output, ["WARNING:backend.main:Resend domain unverified, skipping notification"])

    def test_web_push_payload_keeps_workspace_details_and_safe_route(self):
        payload = main._web_push_payload(
            title="Audit complete",
            message="Your audit for owner/repo is ready. Overall Score: 92/100.",
            action_url="/vault?repo=owner%2Frepo",
            tag="notification:123",
        )
        self.assertEqual(payload["title"], "Audit complete")
        self.assertIn("owner/repo", payload["body"])
        self.assertEqual(payload["action_url"], "/vault?repo=owner%2Frepo")
        self.assertEqual(main._web_push_payload(title="x", message="y", action_url="https://invalid.example", tag="z")["action_url"], "/vault")

    def test_web_push_requires_a_complete_vapid_configuration(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(main._web_push_vapid_config())
        with patch.dict(
            os.environ,
            {
                "WEB_PUSH_VAPID_PUBLIC_KEY": "public",
                "WEB_PUSH_VAPID_PRIVATE_KEY": "private",
                "WEB_PUSH_VAPID_SUBJECT": "mailto:notifications@example.com",
            },
            clear=True,
        ):
            self.assertEqual(
                main._web_push_vapid_config(),
                {
                    "public_key": "public",
                    "private_key": "private",
                    "subject": "mailto:notifications@example.com",
                },
            )

    async def test_notification_web_push_queues_and_sends_without_an_audit(self):
        queue = AsyncMock(return_value=1)
        sender = AsyncMock(return_value={"sent": 1, "expired": 0, "failed": 0})
        notification = {
            "id": "notification-id",
            "user_id": "user-a",
            "project_id": "owner/repo",
            "type": "session_cooldown_re_audit",
            "title": "Coding session complete",
            "message": "Outdated cooldown text.",
            "action_url": "/vault?repo=owner%2Frepo",
            "metadata": {"repo_name": "incorrect/repository", "lines_changed": 20},
        }
        with (
            patch.object(main, "_queue_web_push_event", new=queue),
            patch.object(main, "_send_pending_web_push_deliveries", new=sender),
            patch.object(main, "orchestrate_audit") as full_audit,
            patch.object(main, "run_incremental_audit") as incremental,
        ):
            queued = await main._dispatch_notification_web_push(object(), notification)
        self.assertEqual(queued, 1)
        queue.assert_awaited_once()
        self.assertEqual(
            queue.await_args.kwargs["payload"]["body"],
            "You just shipped 20 new lines of code to owner/repo. "
            "Run a fresh audit to see how it impacts your scorecard.",
        )
        sender.assert_awaited_once()
        full_audit.assert_not_called()
        incremental.assert_not_called()

    async def test_batch_web_push_is_queued_independently_of_email_preferences(self):
        queue = AsyncMock(return_value=1)
        with patch.object(main, "_queue_web_push_event", new=queue):
            await main._dispatch_batch_web_push(
                object(),
                batch_id="batch-id",
                user_id="user-a",
                eligible_notifications=[
                    {"project_id": "owner/repo", "metadata": {"lines_changed": 20}},
                    {"project_id": "owner/second", "metadata": {"lines_changed": 30}},
                ],
            )
        self.assertEqual(queue.await_args.kwargs["event_key"], "batch:batch-id")
        self.assertEqual(queue.await_args.kwargs["email_batch_id"], "batch-id")
        self.assertEqual(queue.await_args.kwargs["payload"]["title"], "Updates pending across multiple projects")

    async def test_project_lifecycle_dispatch_is_immediate_and_non_ai(self):
        dispatch = AsyncMock()
        with (
            patch.object(main, "_dispatch_notification_web_push", new=dispatch),
            patch.object(main, "orchestrate_audit") as full_audit,
            patch.object(main, "run_incremental_audit") as incremental,
        ):
            await main._dispatch_project_lifecycle_web_push(
                object(),
                {
                    "id": "notification-id",
                    "type": "project_created",
                    "title": "Project created",
                    "message": "Project 'Workspace' was successfully created.",
                },
            )
        dispatch.assert_awaited_once()
        full_audit.assert_not_called()
        incremental.assert_not_called()

    async def test_manual_audit_cancels_its_cooldown_and_logs_the_short_milestone(self):
        cooldown_delete = AsyncMock()
        captured_logger = Mock()
        with (
            patch.object(main, "_run_supabase", new=AsyncMock()),
            patch.object(main, "_delete_repository_cooldown", new=cooldown_delete),
            patch.object(main, "_insert_notification", new=AsyncMock(return_value=None)),
            patch.object(main, "logger", captured_logger),
        ):
            await main._record_completed_repository_audit_notification(
                object(),
                user_id="user-a",
                folder_id="folder-id",
                repository="owner/repository",
                audit_id="audit-id",
                score=92,
            )

        cooldown_delete.assert_awaited_once_with(
            ANY,
            user_id="user-a",
            repository="owner/repository",
        )
        captured_logger.info.assert_called_once_with(
            "Manual audit completed for owner/repository: Timer bypassed"
        )

    def test_new_github_repository_root_reuses_lifecycle_rpc_without_email_batching(self):
        create_source = inspect.getsource(main._create_project_folder)
        hierarchy_source = inspect.getsource(main._build_github_folder_hierarchy)
        self.assertIn('"create_project_folder_with_notification"', create_source)
        self.assertIn("_dispatch_project_lifecycle_web_push", create_source)
        self.assertIn("notify_on_creation=True", hierarchy_source)
        self.assertNotIn("notification_email_batches", create_source)
        self.assertNotIn("orchestrate_audit", create_source)
        self.assertNotIn("run_incremental_audit", create_source)

    async def test_new_github_repository_root_dispatches_the_rpc_notification_immediately(self):
        folder = {"id": "folder-id", "name": "owner/repository", "source": "github"}
        notification = {
            "id": "notification-id",
            "type": "project_created",
            "user_id": "user-a",
            "title": "Project created",
            "message": "Project 'owner/repository' was successfully created.",
            "action_url": "/vault?folder=folder-id",
        }
        rpc = Mock()
        rpc.execute.return_value = SimpleNamespace(
            data=[{"folder": folder, "notification": notification}]
        )
        client = Mock()
        client.rpc.return_value = rpc
        dispatch = AsyncMock()

        with patch.object(main, "_dispatch_project_lifecycle_web_push", new=dispatch):
            result = await main._create_project_folder(
                client,
                user_id="user-a",
                folder_name="owner/repository",
                parent_id=None,
                source_supported=True,
                parent_id_supported=True,
                notify_on_creation=True,
            )

        self.assertEqual(result, folder)
        client.rpc.assert_called_once_with(
            "create_project_folder_with_notification",
            {
                "p_user_id": "user-a",
                "p_name": "owner/repository",
                "p_source": "github",
            },
        )
        dispatch.assert_awaited_once_with(client, notification)

    def test_web_push_and_stale_workers_have_no_audit_calls(self):
        worker_sources = "\n".join(
            inspect.getsource(worker)
            for worker in (
                main._send_pending_web_push_deliveries,
                main._process_stale_project_notifications,
                main._process_due_notification_cooldowns,
            )
        )
        self.assertNotIn("orchestrate_audit", worker_sources)
        self.assertNotIn("run_incremental_audit", worker_sources)

    def test_web_push_worker_recovers_claims_retries_and_cleans_expired_devices(self):
        source = inspect.getsource(main._send_pending_web_push_deliveries)
        self.assertIn('"Recovered an interrupted push delivery claim."', source)
        self.assertIn("WEB_PUSH_RETRY_DELAY_MINUTES", source)
        self.assertIn("status_code in {404, 410}", source)
        self.assertIn('.delete()', source)

    async def test_cooldown_worker_never_invokes_audit_functions(self):
        query = Mock()
        query.select.return_value = query
        query.lte.return_value = query
        query.order.return_value = query
        query.limit.return_value = query
        query.execute.return_value = SimpleNamespace(data=[])
        client = Mock()
        client.table.return_value = query
        with (
            patch.object(main, "run_incremental_audit") as incremental,
            patch.object(main, "orchestrate_audit") as full_audit,
        ):
            result = await main._process_due_notification_cooldowns(client)
        self.assertEqual(result, {"created": 0, "suppressed": 0})
        incremental.assert_not_called()
        full_audit.assert_not_called()


class NotificationMigrationTests(unittest.TestCase):
    def test_open_batches_are_rescheduled_to_150_minutes_without_resetting_state(self):
        migration = (Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "202609170002_notification_batch_timing.sql").read_text(encoding="utf-8")
        self.assertIn("window_started_at + interval '150 minutes'", migration)
        self.assertIn("status in ('pending', 'processing', 'failed')", migration)
        self.assertNotIn("provider_idempotency_key =", migration)
        self.assertNotIn("attempt_count =", migration)

    def test_owner_only_rls_and_service_role_policy_are_present(self):
        migration = (Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "202609150002_notification_system.sql").read_text(encoding="utf-8")
        self.assertIn('using (auth.uid() = user_id)', migration)
        self.assertIn('with check (auth.uid() = user_id)', migration)
        self.assertIn('for all to service_role', migration)

    def test_resend_header_uses_the_persisted_idempotency_key(self):
        if main is None:
            self.skipTest(f"Backend dependencies are unavailable: {BACKEND_IMPORT_ERROR}")
        source = Path(main.__file__).read_text(encoding="utf-8")
        self.assertIn('"Idempotency-Key": idempotency_key', source)

    def test_web_push_subscription_rls_and_delivery_idempotency_are_present(self):
        migration = (Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "202609150003_web_push_subscriptions.sql").read_text(encoding="utf-8")
        self.assertIn("create table if not exists public.web_push_subscriptions", migration)
        self.assertIn("unique (endpoint)", migration)
        self.assertIn("unique (subscription_id, event_key)", migration)
        self.assertIn("using (auth.uid() = user_id)", migration)
        self.assertIn("Service role manages web push deliveries", migration)

    def test_project_lifecycle_types_and_transactional_mutations_are_present(self):
        migration = (Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "202609170001_project_lifecycle_notifications.sql").read_text(encoding="utf-8")
        self.assertIn("'project_created'", migration)
        self.assertIn("'project_deleted'", migration)
        self.assertIn("create_project_folder_with_notification", migration)
        self.assertIn("delete_project_folder_with_notification", migration)
        self.assertIn("delete_project_with_notification", migration)
        self.assertNotIn("notification_email_batches", migration)


if __name__ == "__main__":
    unittest.main()
