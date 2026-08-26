"""Read-only Discord preflight, run inside the existing contest container.

Uses the bot's existing environment; never prints credentials or changes Discord.
"""
import json
import os
import urllib.error
import urllib.request

TARGET = "1404736020834156584"
guild_id = os.environ["DISCORD_GUILD_ID"]
role_id = os.getenv("PARTICIPANT_ROLE_ID", "980054891600969748")
role_channel_id = os.getenv("PARTICIPANT_ROLE_CHANNEL_ID", "1512078123297144963")


def get(path):
    request = urllib.request.Request(
        "https://discord.com/api/v10" + path,
        headers={
            "Authorization": "Bot " + os.environ["DISCORD_BOT_TOKEN"],
            "User-Agent": "DiscordBot (https://github.com/kris0425/ai-song-contest, 1.0)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        return {"error_status": error.code}


def summary(message):
    return {
        "id": message["id"], "author_id": message["author"]["id"],
        "bot": message["author"].get("bot", False),
        "content": message.get("content", "")[:800],
        "embeds": [{"title": item.get("title"), "description": item.get("description", "")[:1200]}
                   for item in message.get("embeds", [])],
        "components": message.get("components", []),
    }


me = get("/users/@me")
print(json.dumps({"bot": {key: me.get(key) for key in ("id", "username", "bot")},
                  "guild_id": guild_id, "role_id": role_id}, ensure_ascii=False))
roles = get(f"/guilds/{guild_id}/roles")
print(json.dumps({"music_roles": [{"id": role["id"], "name": role["name"]}
      for role in roles if role["id"] == role_id or "音樂" in role["name"]]}, ensure_ascii=False))
for channel_id in (TARGET, role_channel_id):
    channel = get(f"/channels/{channel_id}")
    print(json.dumps({"channel": {key: channel.get(key) for key in ("id", "name", "guild_id", "type", "error_status")}}, ensure_ascii=False))
    messages = get(f"/channels/{channel_id}/messages?limit=10")
    print(json.dumps({"messages": [summary(message) for message in messages] if isinstance(messages, list) else messages}, ensure_ascii=False))
