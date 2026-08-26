"""Offline tests for the one-time noon announcement. No Discord, no network, no real send.

DISCORD_BOT_TOKEN is deliberately left unset so any unmocked call would fail loudly
instead of reaching Discord. Every test asserts how many POSTs were attempted.
"""
import importlib.util
from datetime import timedelta
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import urllib.error

SPEC = importlib.util.spec_from_file_location("guyun_noon_send", Path(__file__).with_name("send.py"))
subject = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(subject)

VIEW, SEND, HISTORY, MENTION = 1 << 10, 1 << 11, 1 << 16, 1 << 17


class FakeDiscord:
    """In-memory stand-in that records every write, so tests can prove no second POST."""

    def __init__(self):
        self.messages = {}
        self.posts = []
        self.next_id = 9000
        self.registration_open = True
        # Discord does not echo the nonce back on GET; tests that need it flip this on.
        self.echo_nonce_on_get = False
        self.role = {"id": subject.ROLE, "name": subject.ROLE_NAME,
                     "permissions": "0", "mentionable": True}
        self.everyone = {"id": subject.GUILD, "name": "@everyone",
                         "permissions": str(VIEW | SEND | HISTORY)}
        self.member_roles = []
        self.channel = {"id": subject.CHANNEL, "guild_id": subject.GUILD, "type": 0,
                        "permission_overwrites": []}
        self.on_health = lambda: None

    # --- transport ----------------------------------------------------------
    def api(self, path, data=None):
        if data is not None:
            return self.post(path, data)
        if path == "/users/@me":
            return {"id": subject.BOT, "username": "moyun"}
        if path == f"/channels/{subject.CHANNEL}":
            return dict(self.channel)
        if path == f"/guilds/{subject.GUILD}/roles":
            return [dict(self.everyone)] + ([dict(self.role)] if self.role else [])
        if path == f"/guilds/{subject.GUILD}/members/{subject.BOT}":
            return {"roles": list(self.member_roles)}
        if path.startswith(f"/channels/{subject.CHANNEL}/messages?"):
            return [self.readback(m) for m in reversed(list(self.messages.values()))]
        prefix = f"/channels/{subject.CHANNEL}/messages/"
        if path.startswith(prefix):
            return self.readback(self.messages[path[len(prefix):]])
        raise AssertionError(f"unexpected read: {path}")

    def urlopen(self, url, timeout=None):
        assert url == subject.BASE + "/health", f"unexpected fetch: {url}"
        self.on_health()
        return io.BytesIO(json.dumps({"registrationOpen": self.registration_open}).encode())

    # --- helpers ------------------------------------------------------------
    def post(self, path, data):
        assert path == f"/channels/{subject.CHANNEL}/messages", path
        self.posts.append(data)
        self.next_id += 1
        message = {"id": str(self.next_id), "channel_id": subject.CHANNEL,
                   "author": {"id": subject.BOT}, "content": data["content"],
                   "mention_roles": [subject.ROLE], "mention_everyone": False, "mentions": [],
                   "components": data["components"], "nonce": data.get("nonce")}
        self.messages[message["id"]] = message
        return message

    def readback(self, message):
        copy = dict(message)
        if not self.echo_nonce_on_get:
            copy.pop("nonce", None)
        return copy

    def seed_sent_message(self):
        """Stand in for a POST whose response never reached us."""
        self.post(f"/channels/{subject.CHANNEL}/messages", subject.payload())
        self.posts.clear()

    def only_message(self):
        (message,) = self.messages.values()
        return message


def clock(*points):
    """Return a clock yielding each point in turn, then repeating the last."""
    values = list(points)
    return lambda: values.pop(0) if len(values) > 1 else values[0]


class Base(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.receipt = Path(directory.name) / "receipt.json"
        self.discord = FakeDiscord()
        # StringIO keeps the run's own reporting out of the test log, and keeps the
        # preview readable on consoles whose encoding cannot represent the role name.
        self.output = io.StringIO()
        patchers = [patch.object(subject, "RECEIPT", self.receipt),
                    patch.object(subject, "api", self.discord.api),
                    patch("urllib.request.urlopen", self.discord.urlopen),
                    patch("sys.stdout", self.output),
                    patch.dict(os.environ, {"DISCORD_GUILD_ID": subject.GUILD}, clear=True)]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    def send(self, at=None):
        return subject.run(send=True, now=clock(at or subject.WHEN))

    def assertNoPost(self, code, expected):
        self.assertEqual(code, expected)
        self.assertEqual(self.discord.posts, [])


class PayloadTests(Base):
    def test_notifies_only_the_named_creator_role(self):
        payload = subject.payload()
        self.assertIn(f"<@&{subject.ROLE}>", payload["content"])
        self.assertEqual(payload["allowed_mentions"],
                         {"parse": [], "roles": [subject.ROLE], "users": [], "replied_user": False})

    def test_links_point_at_the_contest_site_only(self):
        buttons = subject.payload()["components"][0]["components"]
        self.assertEqual([(b["label"], b["style"], b["url"]) for b in buttons],
                         [("立即報名", 5, subject.BASE + "/register"),
                          ("公開聆聽", 5, subject.BASE + "/works")])

    def test_carries_dedupe_nonce(self):
        payload = subject.payload()
        self.assertEqual(payload["nonce"], subject.NONCE)
        self.assertIs(payload["enforce_nonce"], True)

    def test_nonce_fits_discord_limit(self):
        # A longer nonce is rejected with 50035 NONCE_TYPE_TOO_LONG before the message
        # is created, which would silently cost the whole noon announcement.
        self.assertLessEqual(len(subject.NONCE), 25)

    def test_scheduled_for_taipei_noon_with_a_short_window(self):
        self.assertEqual(subject.WHEN.isoformat(), "2026-08-27T04:00:00+00:00")
        self.assertEqual(subject.EXPIRES - subject.WHEN, timedelta(minutes=15))


class WindowTests(Base):
    def test_preview_is_the_default_and_never_posts(self):
        self.assertNoPost(subject.run(), 0)
        preview = json.loads(self.output.getvalue())
        self.assertEqual(preview["status"], "preview_only")
        self.assertEqual(preview["scheduled_taipei"], "2026-08-27T12:00:00+08:00")
        self.assertEqual(preview["payload"], subject.payload())

    def test_before_the_window_is_retryable_and_never_posts(self):
        self.assertNoPost(self.send(subject.WHEN - timedelta(seconds=1)), 75)

    def test_after_expiry_refuses_and_never_posts(self):
        self.assertNoPost(self.send(subject.EXPIRES + timedelta(seconds=1)), 78)

    def test_window_is_rechecked_after_a_slow_preflight(self):
        code = subject.run(send=True, now=clock(subject.WHEN, subject.WHEN,
                                                subject.EXPIRES + timedelta(seconds=1)))
        self.assertNoPost(code, 78)

    def test_sends_exactly_once_inside_the_window(self):
        self.assertEqual(self.send(), 0)
        self.assertEqual(len(self.discord.posts), 1)
        receipt = json.loads(self.receipt.read_text(encoding="utf-8"))
        self.assertEqual(receipt["status"], "verified")
        self.assertEqual(receipt["message_id"], self.discord.only_message()["id"])
        self.assertEqual(receipt["role_id"], subject.ROLE)


class NoDuplicateTests(Base):
    def test_rerun_verifies_the_existing_message_instead_of_reposting(self):
        self.assertEqual(self.send(), 0)
        self.assertEqual(self.send(), 0)
        self.assertEqual(len(self.discord.posts), 1)

    def test_lost_response_is_reconciled_when_discord_echoes_the_nonce(self):
        self.discord.echo_nonce_on_get = True
        self.discord.seed_sent_message()
        subject.claim()
        self.assertNoPost(self.send(), 0)
        self.assertEqual(json.loads(self.receipt.read_text(encoding="utf-8"))["status"], "verified")

    def test_unreconcilable_pending_receipt_refuses_rather_than_reposting(self):
        # Discord omits the nonce on GET, so the scan cannot match: refuse, never repost.
        self.discord.seed_sent_message()
        subject.claim()
        self.assertNoPost(self.send(), 78)

    def test_pending_receipt_with_nothing_sent_still_refuses(self):
        subject.claim()
        self.assertNoPost(self.send(), 78)

    def test_a_racing_process_claiming_first_blocks_this_one(self):
        self.discord.on_health = subject.claim  # lands between the exists check and our claim
        self.assertNoPost(self.send(), 78)

    def test_receipt_records_the_id_before_verification_runs(self):
        seen = []
        original = subject.verify

        def spy(message):
            seen.append(json.loads(self.receipt.read_text(encoding="utf-8")))
            return original(message)

        with patch.object(subject, "verify", spy):
            self.assertEqual(self.send(), 0)
        self.assertEqual(seen[0]["status"], "sent")
        self.assertEqual(seen[0]["message_id"], self.discord.only_message()["id"])


class PreflightTests(Base):
    def refuse(self):
        with self.assertRaises(AssertionError):
            self.send()
        self.assertEqual(self.discord.posts, [])

    def test_renamed_role_stops_the_send(self):
        self.discord.role["name"] = "❇️｜AI創作者 (舊)"
        self.refuse()

    def test_missing_role_stops_the_send(self):
        self.discord.role = None
        self.refuse()

    def test_closed_registration_stops_the_send(self):
        self.discord.registration_open = False
        self.refuse()

    def test_wrong_guild_environment_stops_the_send(self):
        os.environ["DISCORD_GUILD_ID"] = "1"
        self.refuse()

    def test_wrong_channel_stops_the_send(self):
        self.discord.channel["type"] = 4
        self.refuse()

    def test_each_required_permission_is_enforced(self):
        for bit in (VIEW, SEND, HISTORY):
            with self.subTest(bit=bit):
                self.discord.everyone["permissions"] = str((VIEW | SEND | HISTORY) & ~bit)
                self.refuse()

    def test_unmentionable_role_needs_the_mention_permission(self):
        self.discord.role["mentionable"] = False
        self.refuse()
        self.discord.everyone["permissions"] = str(VIEW | SEND | HISTORY | MENTION)
        self.assertEqual(self.send(), 0)

    def test_channel_overwrite_denying_send_stops_the_send(self):
        self.discord.channel["permission_overwrites"] = [
            {"id": subject.GUILD, "type": 0, "allow": "0", "deny": str(SEND)}]
        self.refuse()

    def test_bot_specific_overwrite_can_restore_send(self):
        self.discord.channel["permission_overwrites"] = [
            {"id": subject.GUILD, "type": 0, "allow": "0", "deny": str(SEND)},
            {"id": subject.BOT, "type": 1, "allow": str(SEND), "deny": "0"}]
        self.assertEqual(self.send(), 0)

    def test_administrator_short_circuits_the_permission_math(self):
        self.discord.everyone["permissions"] = str(1 << 3)
        self.discord.channel["permission_overwrites"] = [
            {"id": subject.GUILD, "type": 0, "allow": "0", "deny": str(SEND | VIEW)}]
        self.assertEqual(self.send(), 0)


class VerifyTests(Base):
    def message(self):
        return self.discord.post(f"/channels/{subject.CHANNEL}/messages", subject.payload())

    def test_accepts_the_message_we_sent(self):
        self.assertEqual(subject.verify(self.message())["status"], "verified")

    def test_rejects_tampering(self):
        cases = {"author": {"author": {"id": "1"}},
                 "channel": {"channel_id": "1"},
                 "content": {"content": "改過的公告"},
                 "extra_role": {"mention_roles": [subject.ROLE, "1"]},
                 "everyone": {"mention_everyone": True},
                 "user_ping": {"mentions": [{"id": "1"}]}}
        for name, override in cases.items():
            with self.subTest(name=name), self.assertRaises(AssertionError):
                subject.verify({**self.message(), **override})

    def test_rejects_a_swapped_button_link(self):
        message = self.message()
        message["components"][0]["components"][0]["url"] = "https://example.com"
        with self.assertRaises(AssertionError):
            subject.verify(message)


class ExitCodeTests(Base):
    def run_main(self, failure):
        with patch.object(subject, "run", side_effect=failure), patch("sys.argv", ["send.py", "--send"]):
            return subject.main()

    def test_configuration_failures_are_terminal(self):
        for failure in (AssertionError("bad"), KeyError("DISCORD_BOT_TOKEN"), ValueError("bad")):
            with self.subTest(failure=type(failure).__name__):
                self.assertEqual(self.run_main(failure), 78)

    def test_transport_failures_stay_retryable(self):
        for failure in (urllib.error.URLError("down"), OSError("disk")):
            with self.subTest(failure=type(failure).__name__):
                self.assertEqual(self.run_main(failure), 75)

    def test_preview_is_the_default_for_the_command_line(self):
        with patch("sys.argv", ["send.py"]):
            self.assertEqual(subject.main(), 0)
        self.assertEqual(self.discord.posts, [])


if __name__ == "__main__":
    unittest.main()
