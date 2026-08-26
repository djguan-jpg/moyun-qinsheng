"""Read-only lookup of the existing role-notification recipient; no DMs."""
import json
import os
import urllib.request

def get(path):
    req = urllib.request.Request("https://discord.com/api/v10" + path, headers={
        "Authorization": "Bot " + os.environ["DISCORD_BOT_TOKEN"],
        "User-Agent": "DiscordBot (https://github.com/kris0425/ai-song-contest, 1.0)",
    })
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)

guild_id = os.environ["DISCORD_GUILD_ID"]
for user_id in filter(None, os.getenv("ROLE_REQUEST_ADMIN_IDS", "").split(",")):
    member = get(f"/guilds/{guild_id}/members/{user_id.strip()}")
    user = member["user"]
    print(json.dumps({"configured_role_recipient": user["id"],
        "username": user["username"], "display_name": user.get("global_name"),
        "server_nickname": member.get("nick"), "bot": user.get("bot", False)}, ensure_ascii=False))
