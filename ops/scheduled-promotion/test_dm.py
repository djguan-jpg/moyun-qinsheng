"""One labelled test DM of the real announcement layout, to Kris only.

Never touches the announcement channel and never notifies anyone: allowed_mentions
suppresses every mention type, and a DM has no roles to ping. Reuses send.payload()
so the buttons under test are the ones that will actually ship. Preview by default;
--send is explicit and guarded by a persistent receipt.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

# Import the deployed send.py when it is present, so the test exercises the exact
# artifact that will ship at noon rather than a copy. This file deliberately lives
# outside the scheduled job's directory: nothing but send.py and lookup.py belongs there.
SCHEDULED = Path("/data/scheduled-promotion-20260827-noon")
sys.path.insert(0, str(SCHEDULED if SCHEDULED.is_dir() else Path(__file__).resolve().parent))
import send

RECIPIENT = "320407142765166602"  # Kris, the same sole recipient the role-notify work used
RECEIPT = Path("/data/guyun-announcement-test-dm-20260826.json")
NONCE = "guyun-20260827-testdm"  # Discord rejects a nonce over 25 characters
BANNER = ("【功能測試】這是 2026-08-27 12:00（台北）預定公告的版面預覽。\n"
          "此訊息只私訊給你，沒有通知任何人，也沒有動到公告頻道。\n"
          "正式公告才會提及 ❇️｜AI創作者 身分組；私訊裡的身分組標記不會顯示成連結，屬正常現象。\n"
          "──────────")


def content():
    return BANNER + "\n" + send.payload()["content"]


def payload():
    return {"content": content(),
            "allowed_mentions": {"parse": [], "roles": [], "users": [], "replied_user": False},
            "components": send.payload()["components"],
            "nonce": NONCE, "enforce_nonce": True}


def verify(message):
    assert message["author"]["id"] == send.BOT, "DM was not authored by the contest bot"
    assert message["content"] == content(), "Delivered text differs from the payload"
    assert not message.get("mention_everyone"), "Test DM must never mention everyone"
    assert not message.get("mentions"), "Test DM must never notify a user"
    actual = message["components"][0]["components"]
    expected = payload()["components"][0]["components"]
    assert [(b["label"], b["style"], b.get("url")) for b in actual] == [
        (b["label"], b["style"], b["url"]) for b in expected], "Buttons differ from the announcement"
    return {"status": "test_dm_verified", "recipient_id": RECIPIENT, "message_id": message["id"],
            "channel_id": message["channel_id"], "mention_roles": message.get("mention_roles", []),
            "announcement_channel_touched": False}


def open_dm():
    channel = send.api("/users/@me/channels", {"recipient_id": RECIPIENT})
    assert channel["type"] == 1, "Not a direct-message channel"
    assert {person["id"] for person in channel["recipients"]} == {RECIPIENT}, "Unexpected DM recipient"
    return channel["id"]


def run(dispatch=False):
    if not dispatch:
        print(json.dumps({"status": "preview_only", "recipient_id": RECIPIENT,
                          "payload": payload()}, ensure_ascii=False))
        return 0
    assert os.environ["DISCORD_GUILD_ID"] == send.GUILD
    assert send.api("/users/@me")["id"] == send.BOT
    if RECEIPT.exists():
        receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
        if not receipt.get("message_id"):
            print("Pending/uncertain test receipt: refusing a second DM; manual review required.")
            return 78
        existing = send.api(f"/channels/{receipt['channel_id']}/messages/{receipt['message_id']}")
        print(json.dumps(verify(existing), ensure_ascii=False))
        return 0
    channel_id = open_dm()
    # Claim before the POST, exactly as send.py does, so a lost response cannot cause a second DM.
    descriptor = os.open(RECEIPT, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump({"status": "pending", "channel_id": channel_id, "recipient_id": RECIPIENT}, handle)
        handle.flush()
        os.fsync(handle.fileno())
    delivered = send.api(f"/channels/{channel_id}/messages", payload())
    RECEIPT.write_text(json.dumps({"status": "sent", "channel_id": channel_id,
                                   "message_id": delivered["id"], "recipient_id": RECIPIENT}),
                       encoding="utf-8")
    result = verify(send.api(f"/channels/{channel_id}/messages/{delivered['id']}"))
    RECEIPT.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send", action="store_true", dest="dispatch")
    args = parser.parse_args()
    try:
        return run(dispatch=args.dispatch)
    except (AssertionError, KeyError, ValueError) as error:
        print(f"Test DM configuration/verification failed: {type(error).__name__}; review before retry.")
        return 78
    except urllib.error.HTTPError as error:
        # Print Discord's own reason: the bare status code is not enough to diagnose a rejection.
        print(f"Discord HTTP {error.code}: {error.read().decode(errors='replace')}")
        return 75
    except (OSError, urllib.error.URLError) as error:
        print(f"Transport/storage error: {type(error).__name__}; receipt governs safe retry.")
        return 75


if __name__ == "__main__":
    sys.exit(main())
