"""Pure payload tests; never contacts Discord."""
import copy
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[2]
sender = runpy.run_path(str(ROOT / "scripts/send-guyun-promotion.py"))
update = runpy.run_path(str(ROOT / "scripts/update-guyun-role-button.py"))


class AnnouncementUpdateTests(unittest.TestCase):
    def setUp(self):
        self.message = sender["payload"]()
        self.message.update(id=update["MESSAGE"], channel_id=update["CHANNEL"],
                            author={"id": update["BOT"]})

    def test_update_only_button_and_explanation(self):
        original = copy.deepcopy(self.message)
        changed = update["replacement"](self.message)
        self.assertEqual(original, self.message)
        self.assertEqual(changed["content"], original["content"])
        self.assertEqual(changed["components"][0]["components"][:2], original["components"][0]["components"][:2])
        self.assertEqual(changed["allowed_mentions"], {"parse": []})
        after = {**original, **changed}
        update["verify_updated"](after, original)
        sender["verify"](after)

    def test_repeated_update_is_idempotent(self):
        first = update["replacement"](self.message)
        after = {**self.message, **first}
        self.assertEqual(first, update["replacement"](after))

    def test_wrong_target_rejected(self):
        for field in ("id", "channel_id"):
            wrong = {**self.message, field: "0"}
            with self.assertRaises(AssertionError):
                update["replacement"](wrong)

    def test_wrong_bot_rejected(self):
        self.message["author"]["id"] = "0"
        with self.assertRaises(AssertionError):
            update["replacement"](self.message)

    def test_unexpected_link_rejected(self):
        self.message["components"][0]["components"][0]["url"] = "https://example.com"
        with self.assertRaises(AssertionError):
            update["replacement"](self.message)


if __name__ == "__main__":
    unittest.main()
