"""Read-only lookup for the explicitly requested creator-role mention.

Not named inspect.py: send.py runs with this directory first on sys.path, and a
module shadowing the standard library would fire these calls on import.
"""
import json
import os
import urllib.request

GUILD = "977834861761015808"
CHANNEL = "1404736020834156584"


def get(path):
    request = urllib.request.Request("https://discord.com/api/v10" + path, headers={
        "Authorization": "Bot " + os.environ["DISCORD_BOT_TOKEN"],
        "User-Agent": "DiscordBot (https://github.com/kris0425/ai-song-contest, 1.0)",
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def main():
    assert os.environ["DISCORD_GUILD_ID"] == GUILD
    me = get("/users/@me")
    roles = get(f"/guilds/{GUILD}/roles")
    member = get(f"/guilds/{GUILD}/members/{me['id']}")
    channel = get(f"/channels/{CHANNEL}")
    print(json.dumps({
        "bot": {key: me[key] for key in ("id", "username")},
        "creator_roles": [{key: role.get(key) for key in ("id", "name", "mentionable", "managed")}
                          for role in roles if "創作" in role["name"] or "ai" in role["name"].casefold()],
        "bot_permissions": [{"id": role["id"], "permissions": role["permissions"]} for role in roles
                            if role["id"] in member["roles"] or role["id"] == GUILD],
        "channel": {key: channel.get(key) for key in ("id", "name", "guild_id", "type", "permission_overwrites")},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
