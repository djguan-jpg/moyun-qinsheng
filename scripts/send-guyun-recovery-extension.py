"""Publish the one-time website recovery and 48-hour extension announcement.

The default is a read-only preview. Pass --send explicitly to publish. A
persistent receipt and Discord nonce prevent an accidental duplicate.
"""

import argparse
import json
import os
from pathlib import Path
import urllib.error
import urllib.request


GUILD_ID = "977834861761015808"
CHANNEL_ID = "1404736020834156584"
BOT_ID = "1480491798215528492"
CREATOR_ROLE_ID = "980054891600969748"

BASE_URL = "https://contest.zoeg.studio"

TITLE = "古韻新生｜網站服務已恢復・投稿延長 48 小時"
RECEIPT = Path("/data/guyun-recovery-extension-20260828.json")


def payload():
    return {
        "content": (
            f"<@&{CREATOR_ROLE_ID}> 網站修復已完成，投稿與公開聆聽服務均已恢復。"
            "為補足維修期間，投稿截止時間延後 48 小時。"
        ),
        "embeds": [
            {
                "title": TITLE,
                "url": BASE_URL + "/",
                "description": (
                    "感謝大家在網站維修期間的耐心等候。首頁、Discord 登入、作品投稿、"
                    "公開聆聽與音樂播放現已恢復正常。"
                ),
                "color": 0x385D70,
                "fields": [
                    {
                        "name": "📅 新投稿截止時間",
                        "value": "**2026 年 9 月 14 日 23:59（台灣時間）**\n原截止時間延後 48 小時。",
                        "inline": False,
                    },
                    {
                        "name": "✏️ 已投稿者可修改作品",
                        "value": (
                            f"使用首次投稿的同一個 Discord 帳號進入[投稿／修改頁]({BASE_URL}/register)，"
                            "即可修改作品名稱、簡介，或選擇替換音檔；系統仍只保留一筆有效投稿。"
                        ),
                        "inline": False,
                    },
                    {
                        "name": "🎧 公開聆聽已恢復",
                        "value": f"[前往匿名作品展演]({BASE_URL}/works)，目前作品皆可正常載入與播放。",
                        "inline": False,
                    },
                ],
                "footer": {"text": "古韻新生｜造成不便，敬請見諒"},
            }
        ],
        "components": [
            {
                "type": 1,
                "components": [
                    {
                        "type": 2,
                        "style": 5,
                        "label": "公開聆聽",
                        "emoji": {"name": "🎧"},
                        "url": BASE_URL + "/works",
                    },
                    {
                        "type": 2,
                        "style": 5,
                        "label": "投稿／修改",
                        "emoji": {"name": "✏️"},
                        "url": BASE_URL + "/register",
                    },
                ],
            }
        ],
        "allowed_mentions": {"parse": [], "roles": [CREATOR_ROLE_ID]},
        "nonce": "guyun-recover-20260828",
        "enforce_nonce": True,
    }


def api(path, data=None):
    request = urllib.request.Request(
        "https://discord.com/api/v10" + path,
        data=json.dumps(data, ensure_ascii=False).encode() if data is not None else None,
        headers={
            "Authorization": "Bot " + os.environ["DISCORD_BOT_TOKEN"],
            "User-Agent": "DiscordBot (https://github.com/kris0425/ai-song-contest, 1.0)",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def verify(message):
    assert message["author"]["id"] == BOT_ID
    assert message["channel_id"] == CHANNEL_ID
    assert message["embeds"][0]["title"] == TITLE
    assert message["mention_roles"] == [CREATOR_ROLE_ID]
    assert not message.get("mention_everyone")
    buttons = message["components"][0]["components"]
    assert [(button["label"], button["url"]) for button in buttons] == [
        ("公開聆聽", BASE_URL + "/works"),
        ("投稿／修改", BASE_URL + "/register"),
    ]
    return {
        "status": "verified",
        "message_id": message["id"],
        "url": f"https://discord.com/channels/{GUILD_ID}/{CHANNEL_ID}/{message['id']}",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send", action="store_true")
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args()

    assert api("/users/@me")["id"] == BOT_ID
    channel = api(f"/channels/{CHANNEL_ID}")
    assert channel["guild_id"] == GUILD_ID and channel["type"] == 0

    messages = api(f"/channels/{CHANNEL_ID}/messages?limit=100")
    for message in messages:
        if message["author"]["id"] == BOT_ID and any(
            embed.get("title") == TITLE for embed in message.get("embeds", [])
        ):
            result = verify(message)
            RECEIPT.write_text(json.dumps(result, ensure_ascii=False))
            print(json.dumps(result, ensure_ascii=False))
            return

    if args.inspect:
        print(json.dumps({"status": "not_found", "checked_messages": len(messages)}, ensure_ascii=False))
        return

    if RECEIPT.exists():
        receipt = json.loads(RECEIPT.read_text())
        if not receipt.get("message_id"):
            raise RuntimeError("Pending receipt: inspect Discord before retrying")
        print(json.dumps(verify(api(f"/channels/{CHANNEL_ID}/messages/{receipt['message_id']}")), ensure_ascii=False))
        return

    if not args.send:
        print(json.dumps({"status": "preview_only", "payload": payload()}, ensure_ascii=False, indent=2))
        return

    with urllib.request.urlopen(BASE_URL + "/health", timeout=15) as response:
        health = json.load(response)
        assert health["registrationOpen"] is True
    with urllib.request.urlopen(BASE_URL + "/works", timeout=15) as response:
        assert "公開作品展演" in response.read().decode()

    descriptor = os.open(RECEIPT, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump({"status": "pending", "channel_id": CHANNEL_ID}, handle)

    message = api(f"/channels/{CHANNEL_ID}/messages", payload())
    RECEIPT.write_text(json.dumps({"status": "sent", "message_id": message["id"]}))
    result = verify(api(f"/channels/{CHANNEL_ID}/messages/{message['id']}"))
    RECEIPT.write_text(json.dumps(result, ensure_ascii=False))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:2000]
        raise SystemExit(
            f"Discord/website HTTP {error.code}: {detail}; do not retry a pending send automatically"
        )
