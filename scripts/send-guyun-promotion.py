"""One approved announcement; defaults to read-only preview.

Run inside the existing ai-song-contest container so credentials stay on-host.
Pass --send explicitly to publish. A persistent receipt plus Discord nonce
prevents accidental repeats; uncertain sends remain blocked for manual review.
"""
import argparse
import json
import os
from pathlib import Path
import urllib.error
import urllib.request

GUILD = "977834861761015808"
CHANNEL = "1404736020834156584"
BOT = "1480491798215528492"
ROLE_CHANNEL = "1512078123297144963"
BASE = "https://moyun.161-33-185-80.sslip.io/guyun"
TITLE = "古韻新生｜投稿開放・匿名聆聽上線"
RECEIPT = Path("/data/guyun-promotion-20260826-1404736020834156584.json")


def payload():
    links = [
        ("公開聆聽", "🎧", BASE + "/works"),
        ("立即報名", "🎤", BASE + "/register"),
        ("取得音樂身分組", "🎵", f"https://discord.com/channels/{GUILD}/{ROLE_CHANNEL}"),
    ]
    return {
        "content": "🎼 **古韻新生・古風音樂大賽**\n邀請你帶著作品來，也歡迎先來聽聽大家的創作！",
        "embeds": [{
            "title": TITLE,
            "url": BASE + "/",
            "description": "讓古風意境化成旋律，讓每一段創作被聽見。\n\n目前開放投稿，公開聆聽頁也已上線；不參賽也能直接欣賞匿名作品。",
            "color": 0x385D70,
            "fields": [
                {"name": "🎧 公開聆聽", "value": f"[開啟匿名作品展演]({BASE}/works)\n作品以匿名編號呈現；歌名與創作理念待主辦單位公告後公開。", "inline": False},
                {"name": "🎤 投稿報名", "value": f"[前往正式報名頁]({BASE}/register)\n使用 Discord 登入，持有「🎵｜音樂創作者」身分組即可投稿。每個帳號限一筆有效報名，截止前可修改資料或替換音檔。", "inline": False},
                {"name": "🎵 還沒有音樂身分組？", "value": "點下方「取得音樂身分組」，前往「🫡｜身分組獲得」頻道，依頻道指引完成領取後再返回報名頁。", "inline": False},
                {"name": "📅 報名截止", "value": "**2026 年 9 月 12 日 23:59（台灣時間）**\n目前為投稿與公開聆聽階段，投票時程請留意後續公告。", "inline": False},
            ],
            "footer": {"text": "古韻新生｜讓每一段旋律被聽見"},
        }],
        "components": [{"type": 1, "components": [
            {"type": 2, "style": 5, "label": label, "emoji": {"name": emoji}, "url": url}
            for label, emoji, url in links
        ]}],
        "allowed_mentions": {"parse": []},
        "nonce": "guyun-20260826-launch",
        "enforce_nonce": True,
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


def verify(message):
    assert message["author"]["id"] == BOT
    assert message["channel_id"] == CHANNEL
    assert message["embeds"][0]["title"] == TITLE
    expected = payload()["components"][0]["components"]
    actual = message["components"][0]["components"]
    assert len(actual) == 3
    assert [(b["label"], b["url"], b["style"]) for b in actual[:2]] == [
        (b["label"], b["url"], b["style"]) for b in expected[:2]]
    assert (actual[2].get("url") == expected[2]["url"] or
            (actual[2].get("custom_id") == "guyun:request-music-role:kris:v1"
             and actual[2]["style"] == 1 and "url" not in actual[2]))
    assert not message.get("mention_everyone") and not message.get("mention_roles")
    return {"status": "verified", "message_id": message["id"],
            "url": f"https://discord.com/channels/{GUILD}/{CHANNEL}/{message['id']}",
            "buttons": [{key: b[key] for key in ("label", "url", "custom_id") if key in b} for b in actual]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send", action="store_true")
    args = parser.parse_args()
    assert os.environ["DISCORD_GUILD_ID"] == GUILD
    assert api("/users/@me")["id"] == BOT
    for channel_id in (CHANNEL, ROLE_CHANNEL):
        channel = api(f"/channels/{channel_id}")
        assert channel["guild_id"] == GUILD and channel["type"] == 0
    if RECEIPT.exists():
        receipt = json.loads(RECEIPT.read_text())
        if not receipt.get("message_id"):
            raise RuntimeError("Pending receipt: review Discord before any retry; no new message sent")
        print(json.dumps(verify(api(f"/channels/{CHANNEL}/messages/{receipt['message_id']}")), ensure_ascii=False))
        return
    for message in api(f"/channels/{CHANNEL}/messages?limit=100"):
        if message["author"]["id"] == BOT and any(e.get("title") == TITLE for e in message.get("embeds", [])):
            print(json.dumps(verify(message), ensure_ascii=False))
            return
    if not args.send:
        print(json.dumps({"status": "preview_only", "payload": payload()}, ensure_ascii=False, indent=2))
        return
    with urllib.request.urlopen(BASE + "/health", timeout=15) as response:
        assert json.load(response)["registrationOpen"] is True
    with urllib.request.urlopen(BASE + "/works", timeout=15) as response:
        assert "公開作品展演" in response.read().decode()
    # Claim before POST. Never automatically retry an ambiguous network failure.
    descriptor = os.open(RECEIPT, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump({"status": "pending", "channel_id": CHANNEL}, handle)
    message = api(f"/channels/{CHANNEL}/messages", payload())
    RECEIPT.write_text(json.dumps({"status": "sent", "message_id": message["id"]}))
    result = verify(api(f"/channels/{CHANNEL}/messages/{message['id']}"))
    RECEIPT.write_text(json.dumps(result, ensure_ascii=False))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Discord/website HTTP {error.code}; do not retry a pending send automatically")
