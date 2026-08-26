"""Update the existing announcement only; --test-dm / --apply are explicit writes."""
import argparse
import copy
import json
import os
from pathlib import Path
import urllib.error
import urllib.request

GUILD = "977834861761015808"
CHANNEL = "1404736020834156584"
MESSAGE = "1542161616999555183"
BOT = "1480491798215528492"
RECIPIENT = "320407142765166602"
CUSTOM_ID = "guyun:request-music-role:kris:v1"
BASE = "https://moyun.161-33-185-80.sslip.io/guyun"
TITLE = "古韻新生｜投稿開放・匿名聆聽上線"
LABEL = "通知 Kris 申請身分組"
FIELD = "🎵 還沒有音樂身分組？"
EXPLANATION = ("點下方「通知 Kris 申請身分組」，大幫手會將你的 Discord 帳號與申請資訊私訊給 Kris，"
               "由 Kris 確認後手動授予。已有身分組或一小時內已申請者，不會重複通知。")
BACKUP = Path("/data/guyun-promotion-before-role-notify-20260826.json")
TEST_RECEIPT = Path("/data/guyun-role-notify-test-20260826.json")
ANNOUNCEMENT_PATH = f"/channels/{CHANNEL}/messages/{MESSAGE}"
ANNOUNCEMENT_URL = f"https://discord.com/channels/{GUILD}/{CHANNEL}/{MESSAGE}"


def api(path, data=None, method=None):
    request = urllib.request.Request(
        "https://discord.com/api/v10" + path,
        data=json.dumps(data, ensure_ascii=False).encode() if data is not None else None,
        method=method,
        headers={"Authorization": "Bot " + os.environ["DISCORD_BOT_TOKEN"],
                 "User-Agent": "DiscordBot (https://github.com/kris0425/ai-song-contest, 1.0)",
                 "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def exclusive_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False)


def validate(message):
    assert message["id"] == MESSAGE and message["channel_id"] == CHANNEL
    assert message["author"]["id"] == BOT
    assert len(message["embeds"]) == 1 and message["embeds"][0]["title"] == TITLE
    assert len(message["components"]) == 1
    buttons = message["components"][0]["components"]
    assert len(buttons) == 3
    assert [(b["label"], b["style"], b.get("url")) for b in buttons[:2]] == [
        ("公開聆聽", 5, BASE + "/works"), ("立即報名", 5, BASE + "/register")]
    assert (buttons[2].get("custom_id") == CUSTOM_ID or
            (buttons[2]["style"] == 5 and buttons[2].get("url") ==
             f"https://discord.com/channels/{GUILD}/1512078123297144963"))
    assert sum(f["name"] == FIELD for f in message["embeds"][0]["fields"]) == 1
    assert not message.get("mention_everyone") and not message.get("mention_roles")


def replacement(message):
    validate(message)
    embed = {key: copy.deepcopy(value) for key, value in message["embeds"][0].items()
             if key in ("title", "url", "description", "color", "fields", "footer")}
    for field in embed["fields"]:
        if field["name"] == FIELD:
            field["value"] = EXPLANATION
    buttons = [{key: copy.deepcopy(value) for key, value in button.items()
                if key in ("type", "style", "label", "emoji", "url", "disabled")}
               for button in message["components"][0]["components"][:2]]
    buttons.append({"type": 2, "style": 1, "label": LABEL,
                    "emoji": {"name": "🎵"}, "custom_id": CUSTOM_ID})
    return {"content": message["content"], "embeds": [embed],
            "components": [{"type": 1, "components": buttons}],
            "allowed_mentions": {"parse": []}}


def verify_updated(message, previous):
    validate(message)
    assert message["content"] == previous["content"]
    button = message["components"][0]["components"][2]
    assert button["style"] == 1 and button["custom_id"] == CUSTOM_ID and button["label"] == LABEL
    assert "url" not in button
    assert next(f["value"] for f in message["embeds"][0]["fields"] if f["name"] == FIELD) == EXPLANATION
    for key in ("title", "url", "description", "color", "footer"):
        assert message["embeds"][0].get(key) == previous["embeds"][0].get(key)
    assert [f for f in message["embeds"][0]["fields"] if f["name"] != FIELD] == [
        f for f in previous["embeds"][0]["fields"] if f["name"] != FIELD]


def test_dm():
    if TEST_RECEIPT.exists():
        receipt = json.loads(TEST_RECEIPT.read_text(encoding="utf-8"))
        if not receipt.get("message_id"):
            raise RuntimeError("Uncertain previous DM; inspect receipt before retry")
        delivered = api(f"/channels/{receipt['channel_id']}/messages/{receipt['message_id']}")
        assert delivered["author"]["id"] == BOT
        print(json.dumps({"status": "test_dm_already_verified", "recipient_id": RECIPIENT}))
        return
    channel = api("/users/@me/channels", {"recipient_id": RECIPIENT})
    assert channel["type"] == 1 and {r["id"] for r in channel["recipients"]} == {RECIPIENT}
    exclusive_json(TEST_RECEIPT, {"status": "pending", "channel_id": channel["id"], "recipient_id": RECIPIENT})
    content = ("【功能測試】古韻新生的身分組申請通知已接通。\n"
               "此訊息只用來確認大幫手可以私訊通知你，不是成員申請，也不會授予任何身分組。")
    delivered = api(f"/channels/{channel['id']}/messages", {
        "content": content, "allowed_mentions": {"parse": []},
        "nonce": "guyun-role-test-20260826", "enforce_nonce": True})
    TEST_RECEIPT.write_text(json.dumps({"status": "sent", "channel_id": channel["id"],
                                      "message_id": delivered["id"], "recipient_id": RECIPIENT}), encoding="utf-8")
    confirmed = api(f"/channels/{channel['id']}/messages/{delivered['id']}")
    assert confirmed["content"] == content and confirmed["author"]["id"] == BOT
    print(json.dumps({"status": "test_dm_verified", "recipient_id": RECIPIENT, "message_id": delivered["id"]}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--test-dm", action="store_true")
    actions.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    assert os.environ["DISCORD_GUILD_ID"] == GUILD
    assert os.environ.get("ROLE_REQUEST_ADMIN_IDS", "").strip() == RECIPIENT
    assert api("/users/@me")["id"] == BOT
    assert api(f"/channels/{CHANNEL}")["guild_id"] == GUILD
    recipient = api(f"/guilds/{GUILD}/members/{RECIPIENT}")["user"]
    assert recipient["id"] == RECIPIENT and not recipient.get("bot")
    message = api(ANNOUNCEMENT_PATH)
    new_payload = replacement(message)
    if args.test_dm:
        test_dm()
        return
    if not args.apply:
        print(json.dumps({"status": "preview_only", "url": ANNOUNCEMENT_URL,
                          "button": new_payload["components"][0]["components"][2],
                          "explanation": EXPLANATION}, ensure_ascii=False))
        return
    # Do not expose a live button until its persistent handler is available.
    from app.guyun_role_notify import CUSTOM_ID as deployed_id
    assert deployed_id == CUSTOM_ID
    assert Path("/data/guyun-role-requests.sqlite3").is_file()
    assert TEST_RECEIPT.exists() and json.loads(TEST_RECEIPT.read_text()).get("message_id")
    if not BACKUP.exists():
        exclusive_json(BACKUP, {"message": message, "new_payload": new_payload})
    try:
        verify_updated(message, message)
    except (AssertionError, KeyError):
        api(ANNOUNCEMENT_PATH, new_payload, method="PATCH")
    verify_updated(api(ANNOUNCEMENT_PATH), message)
    print(json.dumps({"status": "updated_and_verified", "message_id": MESSAGE,
                      "url": ANNOUNCEMENT_URL, "button": LABEL}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Discord HTTP {error.code}; inspect state before retrying any write")
