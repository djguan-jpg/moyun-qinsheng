"""Single authorized noon announcement. Preview by default; credentials stay in bot container."""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

GUILD = "977834861761015808"
CHANNEL = "1404736020834156584"
BOT = "1480491798215528492"
ROLE = "977847655759765514"
ROLE_NAME = "❇️｜AI創作者"
BASE = "https://moyun.161-33-185-80.sslip.io/guyun"
WHEN = datetime(2026, 8, 27, 4, 0, tzinfo=timezone.utc)
EXPIRES = WHEN + timedelta(minutes=15)
NONCE = "guyun-20260827-noon-ai"
RECEIPT = Path("/data/guyun-announcement-20260827-noon.json")


def payload():
    return {
        "content": f"<@&{ROLE}>\n**古韻新生｜古風音樂大賽**\n比賽已經開始了，歡迎踴躍投稿！",
        "allowed_mentions": {"parse": [], "roles": [ROLE], "users": [], "replied_user": False},
        "components": [{"type": 1, "components": [
            {"type": 2, "style": 5, "label": "立即報名", "emoji": {"name": "🎤"}, "url": BASE + "/register"},
            {"type": 2, "style": 5, "label": "公開聆聽", "emoji": {"name": "🎧"}, "url": BASE + "/works"},
        ]}],
        "nonce": NONCE, "enforce_nonce": True,
    }


def api(path, data=None):
    request = urllib.request.Request(
        "https://discord.com/api/v10" + path,
        data=json.dumps(data, ensure_ascii=False).encode() if data is not None else None,
        headers={"Authorization": "Bot " + os.environ["DISCORD_BOT_TOKEN"],
                 "User-Agent": "DiscordBot (https://github.com/kris0425/ai-song-contest, 1.0)",
                 "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def permissions(roles, member, channel):
    member_roles = set(member["roles"])
    value = 0
    for role in roles:
        if role["id"] == GUILD or role["id"] in member_roles:
            value |= int(role["permissions"])
    if value & (1 << 3):
        return (1 << 64) - 1
    overwrites = channel.get("permission_overwrites", [])
    for overwrite in overwrites:
        if overwrite["id"] == GUILD and overwrite["type"] == 0:
            value = (value & ~int(overwrite["deny"])) | int(overwrite["allow"])
    allow = deny = 0
    for overwrite in overwrites:
        if overwrite["type"] == 0 and overwrite["id"] in member_roles:
            allow |= int(overwrite["allow"])
            deny |= int(overwrite["deny"])
    value = (value & ~deny) | allow
    for overwrite in overwrites:
        if overwrite["type"] == 1 and overwrite["id"] == BOT:
            value = (value & ~int(overwrite["deny"])) | int(overwrite["allow"])
    return value


def preflight():
    assert os.environ["DISCORD_GUILD_ID"] == GUILD
    assert api("/users/@me")["id"] == BOT
    channel = api(f"/channels/{CHANNEL}")
    assert channel["guild_id"] == GUILD and channel["type"] == 0
    roles = api(f"/guilds/{GUILD}/roles")
    role = next((item for item in roles if item["id"] == ROLE), None)
    assert role is not None and role["name"] == ROLE_NAME, "Requested role changed; review before sending"
    member = api(f"/guilds/{GUILD}/members/{BOT}")
    effective = permissions(roles, member, channel)
    assert effective & (1 << 10) and effective & (1 << 11), "Cannot view/send in target channel"
    assert effective & (1 << 16), "Cannot verify message history"
    assert role["mentionable"] or effective & (1 << 17), "Cannot notify the requested role"
    with urllib.request.urlopen(BASE + "/health", timeout=15) as response:
        assert json.load(response)["registrationOpen"] is True, "Registration is no longer open"


def verify(message):
    expected = payload()
    assert message["author"]["id"] == BOT and message["channel_id"] == CHANNEL
    assert message["content"] == expected["content"]
    assert set(message.get("mention_roles", [])) == {ROLE}
    assert not message.get("mention_everyone") and not message.get("mentions")
    actual_buttons = message["components"][0]["components"]
    assert [(b["label"], b["style"], b.get("url")) for b in actual_buttons] == [
        (b["label"], b["style"], b["url"]) for b in expected["components"][0]["components"]]
    return {"status": "verified", "message_id": message["id"], "channel_id": CHANNEL,
            "role_id": ROLE, "url": f"https://discord.com/channels/{GUILD}/{CHANNEL}/{message['id']}"}


def save_receipt(value):
    temporary = RECEIPT.with_suffix(".json.new")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, RECEIPT)


def claim():
    descriptor = os.open(RECEIPT, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump({"status": "pending", "channel_id": CHANNEL, "role_id": ROLE, "nonce": NONCE}, handle)
        handle.flush()
        os.fsync(handle.fileno())


def run(send=False, now=None):
    clock = now or (lambda: datetime.now(timezone.utc))
    if send and clock() < WHEN:
        print("Too early: no announcement sent.")
        return 75
    if send and clock() > EXPIRES:
        print("Expired: no late announcement sent; manual review required.")
        return 78
    if send and RECEIPT.exists():
        receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
        if receipt.get("message_id"):
            result = verify(api(f"/channels/{CHANNEL}/messages/{receipt['message_id']}"))
            save_receipt(result)
            print(json.dumps(result, ensure_ascii=False))
            return 0
        # A prior POST might have succeeded. Only reconcile by GET; never resend.
        for message in api(f"/channels/{CHANNEL}/messages?limit=100"):
            if message["author"]["id"] == BOT and message.get("nonce") == NONCE:
                result = verify(message)
                save_receipt(result)
                print(json.dumps(result, ensure_ascii=False))
                return 0
        print("Pending/uncertain receipt: refusing duplicate POST; manual review required.")
        return 78
    preflight()
    if not send:
        print(json.dumps({"status": "preview_only", "scheduled_taipei": "2026-08-27T12:00:00+08:00",
                          "channel_id": CHANNEL, "role_name": ROLE_NAME, "payload": payload()}, ensure_ascii=False))
        return 0
    if not WHEN <= clock() <= EXPIRES:
        print("Outside scheduled window after preflight; no POST.")
        return 78
    try:
        claim()
    except FileExistsError:
        print("Another execution claimed this announcement; no POST.")
        return 78
    message = api(f"/channels/{CHANNEL}/messages", payload())
    # Save the returned ID before verification, so even failed GETs cannot cause a second send.
    save_receipt({"status": "sent", "message_id": message["id"], "channel_id": CHANNEL})
    result = verify(api(f"/channels/{CHANNEL}/messages/{message['id']}"))
    save_receipt(result)
    print(json.dumps(result, ensure_ascii=False))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send", action="store_true")
    args = parser.parse_args()
    try:
        return run(send=args.send)
    except (AssertionError, KeyError, ValueError) as error:
        print(f"Configuration/verification failed: {type(error).__name__}; manual review required.")
        return 78
    except (OSError, urllib.error.URLError) as error:
        # Retry safe reads only. A durable pending receipt blocks an ambiguous second POST.
        print(f"Temporary transport/storage error: {type(error).__name__}; receipt governs safe retry.")
        return 75


if __name__ == "__main__":
    sys.exit(main())
