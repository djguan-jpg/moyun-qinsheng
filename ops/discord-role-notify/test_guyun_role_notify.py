"""Isolated tests: all Discord operations are mocks; no real messages or roles."""
import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace as NS
import unittest
from unittest.mock import AsyncMock, Mock, patch

import discord
import guyun_role_notify as subject


class RoleNotificationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "requests.sqlite3"
        self.store = subject.RequestStore(self.path)
        self.member = NS(id=123456789, roles=[], name="test_user", display_name="Test User")
        self.recipient = NS(bot=False, send=AsyncMock(return_value=NS(id=555)))
        self.guild = NS(fetch_member=AsyncMock(return_value=self.member))
        self.bot = NS(get_guild=Mock(return_value=self.guild), get_user=Mock(return_value=self.recipient),
                      fetch_user=AsyncMock(return_value=self.recipient), add_view=Mock(),
                      settings=NS(discord_guild_id=subject.GUILD_ID, participant_role_id=subject.ROLE_ID))
        self.view = subject.GuyunRoleNotifyView(self.bot, self.store)

    def interaction(self, **overrides):
        values = dict(guild_id=subject.GUILD_ID, channel_id=subject.CHANNEL_ID,
                      message=NS(id=subject.MESSAGE_ID), user=NS(id=self.member.id, bot=False),
                      response=NS(defer=AsyncMock(), send_message=AsyncMock()),
                      followup=NS(send=AsyncMock()))
        values.update(overrides)
        return NS(**values)

    async def click(self, interaction=None):
        interaction = interaction or self.interaction()
        await self.view.children[0].callback(interaction)
        return interaction

    async def test_persistent_button_and_exact_custom_id(self):
        self.assertTrue(self.view.is_persistent())
        self.assertEqual(self.view.children[0].custom_id, subject.CUSTOM_ID)
        self.assertIsNone(self.view.children[0].url)

    async def test_request_notifies_only_kris_with_requester_identity(self):
        interaction = await self.click()
        self.bot.get_user.assert_called_once_with(subject.RECIPIENT_ID)
        self.recipient.send.assert_awaited_once()
        sent = self.recipient.send.call_args.kwargs
        self.assertIn("古韻新生", sent["embed"].title)
        self.assertIn(str(self.member.id), [field.value for field in sent["embed"].fields])
        self.assertEqual(sent["allowed_mentions"].to_dict(), {"parse": []})
        self.assertTrue(interaction.followup.send.call_args.kwargs["ephemeral"])
        self.assertIn("已私訊通知 Kris", interaction.followup.send.call_args.args[0])
        self.assertEqual(self.store.claim(self.member.id), "sent")

    async def test_existing_role_does_not_notify(self):
        self.member.roles = [NS(id=subject.ROLE_ID)]
        interaction = await self.click()
        self.recipient.send.assert_not_awaited()
        self.assertIn("已持有", interaction.followup.send.call_args.args[0])

    async def test_duplicate_and_restart_keep_cooldown(self):
        await self.click()
        self.view = subject.GuyunRoleNotifyView(self.bot, subject.RequestStore(self.path))
        interaction = await self.click()
        self.recipient.send.assert_awaited_once()
        self.assertIn("不會重複通知", interaction.followup.send.call_args.args[0])

    async def test_concurrent_clicks_send_once(self):
        await asyncio.gather(self.click(), self.click(), self.click())
        self.recipient.send.assert_awaited_once()

    async def test_wrong_guild_channel_message_or_bot_cannot_notify(self):
        for override in ({"guild_id": 99}, {"channel_id": 99}, {"message": NS(id=99)},
                         {"user": NS(id=self.member.id, bot=True)}):
            with self.subTest(override=override):
                interaction = await self.click(self.interaction(**override))
                interaction.response.defer.assert_not_awaited()
                interaction.response.send_message.assert_awaited_once()
        self.recipient.send.assert_not_awaited()

    async def test_dm_forbidden_reports_failure_and_short_retry_cooldown(self):
        self.recipient.send.side_effect = discord.Forbidden(NS(status=403, reason="Forbidden"), "DM closed")
        interaction = await self.click()
        self.assertIn("通知尚未送達", interaction.followup.send.call_args.args[0])
        self.assertEqual(self.store.claim(self.member.id), "failed")
        with patch.object(subject.time, "time", return_value=subject.time.time() + 61):
            self.assertIsNone(self.store.claim(self.member.id))

    async def test_uncertain_network_failure_does_not_report_success_or_retry_dm(self):
        self.recipient.send.side_effect = OSError("connection lost")
        with self.assertLogs(subject.log, level="ERROR"):
            interaction = await self.click()
        self.assertIn("無法確認", interaction.followup.send.call_args.args[0])
        self.assertEqual(self.store.claim(self.member.id), "pending")
        await self.click()
        self.recipient.send.assert_awaited_once()

    async def test_cooldown_expires_after_one_hour(self):
        await self.click()
        with patch.object(subject.time, "time", return_value=subject.time.time() + 3601):
            await self.click()
        self.assertEqual(self.recipient.send.await_count, 2)

    async def test_missing_guild_reports_unavailable_without_notifying(self):
        self.bot.get_guild.return_value = None
        with self.assertLogs(subject.log, level="ERROR"):
            interaction = await self.click()
        self.recipient.send.assert_not_awaited()
        self.assertIn("無法確認", interaction.followup.send.call_args.args[0])

    async def test_registration_scoped_to_existing_message_and_single_recipient(self):
        with patch.dict(subject.os.environ, {"ROLE_REQUEST_ADMIN_IDS": str(subject.RECIPIENT_ID)}), \
                patch.object(subject, "RequestStore", return_value=self.store):
            self.assertTrue(subject.register_guyun_role_notification(self.bot))
        self.assertEqual(self.bot.add_view.call_args.kwargs, {"message_id": subject.MESSAGE_ID})
        for recipients in ("", "999", f"{subject.RECIPIENT_ID},999"):
            with patch.dict(subject.os.environ, {"ROLE_REQUEST_ADMIN_IDS": recipients}), \
                    self.assertLogs(subject.log, level="ERROR"):
                self.assertFalse(subject.register_guyun_role_notification(self.bot))
        self.bot.add_view.assert_called_once()

    async def test_missing_store_does_not_stop_existing_bot(self):
        with patch.dict(subject.os.environ, {"ROLE_REQUEST_ADMIN_IDS": str(subject.RECIPIENT_ID)}), \
                patch.object(subject, "RequestStore", side_effect=OSError("read-only")), \
                self.assertLogs(subject.log, level="ERROR"):
            self.assertFalse(subject.register_guyun_role_notification(self.bot))
        self.bot.add_view.assert_not_called()


if __name__ == "__main__":
    unittest.main()
