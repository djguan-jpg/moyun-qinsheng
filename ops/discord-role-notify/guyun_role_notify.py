"""Persistent, announcement-scoped role requests delivered only to Kris."""
from __future__ import annotations

from contextlib import closing
import logging
import os
from pathlib import Path
import sqlite3
import time

import discord

log = logging.getLogger(__name__)
GUILD_ID = 977834861761015808
CHANNEL_ID = 1404736020834156584
MESSAGE_ID = 1542161616999555183
RECIPIENT_ID = 320407142765166602  # Existing ROLE_REQUEST_ADMIN_IDS: Kris / kris5205
ROLE_ID = 980054891600969748
CUSTOM_ID = "guyun:request-music-role:kris:v1"

BASE_URL = "https://contest.zoeg.studio"

ANNOUNCEMENT_URL = f"https://discord.com/channels/{GUILD_ID}/{CHANNEL_ID}/{MESSAGE_ID}"


class RequestStore:
    def __init__(self, path: str | Path):
        self.path = path
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute("CREATE TABLE IF NOT EXISTS role_requests ("
                               "user_id TEXT PRIMARY KEY, attempted_at REAL NOT NULL, "
                               "status TEXT NOT NULL, message_id TEXT)")

    def claim(self, user_id: int) -> str | None:
        now = time.time()
        with closing(sqlite3.connect(self.path, timeout=3)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT attempted_at, status FROM role_requests WHERE user_id=?",
                                     (str(user_id),)).fetchone()
            if row and now - row[0] < (60 if row[1] == "failed" else 3600):
                return row[1]
            connection.execute("INSERT INTO role_requests VALUES (?, ?, 'pending', NULL) "
                               "ON CONFLICT(user_id) DO UPDATE SET attempted_at=excluded.attempted_at, "
                               "status='pending', message_id=NULL", (str(user_id), now))
        return None

    def finish(self, user_id: int, status: str, message_id: int | None = None):
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute("UPDATE role_requests SET status=?, message_id=? WHERE user_id=?",
                               (status, str(message_id) if message_id else None, str(user_id)))


def entry_links() -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(discord.ui.Button(label="立即報名", url=BASE_URL + "/register"))
    view.add_item(discord.ui.Button(label="公開聆聽", url=BASE_URL + "/works"))
    return view


class GuyunRoleNotifyView(discord.ui.View):
    def __init__(self, bot, store: RequestStore):
        super().__init__(timeout=None)
        self.bot = bot
        self.store = store

    @discord.ui.button(label="通知 Kris 申請身分組", emoji="🎵",
                       style=discord.ButtonStyle.primary, custom_id=CUSTOM_ID)
    async def notify(self, interaction: discord.Interaction, button: discord.ui.Button):
        if (interaction.guild_id != GUILD_ID or interaction.channel_id != CHANNEL_ID
                or getattr(interaction.message, "id", None) != MESSAGE_ID
                or interaction.user.bot):
            await interaction.response.send_message("請回到古韻新生的原公告申請。", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            guild = self.bot.get_guild(GUILD_ID)
            if guild is None:
                raise RuntimeError("Guild unavailable")
            member = await guild.fetch_member(interaction.user.id)
            if any(role.id == ROLE_ID for role in member.roles):
                await interaction.followup.send("你已持有音樂創作者身分組，可以直接報名；未另行通知 Kris。",
                                                view=entry_links(), ephemeral=True)
                return
            status = self.store.claim(member.id)
            if status:
                replies = {
                    "sent": "一小時內已通知 Kris，請等待手動處理，不會重複通知。",
                    "pending": "你的申請正在處理或確認中，請勿重複點擊；若未收到回覆，請聯絡 Kris。",
                    "failed": "剛才通知未成功，請稍候一分鐘再試，或直接聯絡 Kris。",
                }
                await interaction.followup.send(replies[status], ephemeral=True)
                return
            recipient = self.bot.get_user(RECIPIENT_ID) or await self.bot.fetch_user(RECIPIENT_ID)
            if recipient.bot:
                raise RuntimeError("Recipient must be human")
            embed = discord.Embed(title="🎵 古韻新生｜音樂身分組申請",
                                  description="有成員透過活動公告申請音樂創作者身分組，請你確認後手動授予。",
                                  color=0x385D70)
            embed.add_field(name="申請者", value=discord.utils.escape_markdown(member.display_name)[:256], inline=True)
            embed.add_field(name="Discord 帳號", value=discord.utils.escape_markdown(member.name)[:256], inline=True)
            embed.add_field(name="使用者 ID", value=str(member.id), inline=False)
            embed.add_field(name="申請身分組", value="🎵｜音樂創作者", inline=False)
            embed.set_footer(text="由本人點擊公告按鈕提出；此通知不會自動授予身分組。")
            view = discord.ui.View(timeout=None)
            view.add_item(discord.ui.Button(label="查看申請者", url=f"https://discord.com/users/{member.id}"))
            view.add_item(discord.ui.Button(label="回到活動公告", url=ANNOUNCEMENT_URL))
            try:
                delivered = await recipient.send(embed=embed, view=view,
                                                 allowed_mentions=discord.AllowedMentions.none())
            except discord.Forbidden:
                self.store.finish(member.id, "failed")
                await interaction.followup.send("目前無法私訊 Kris，通知尚未送達；請直接聯絡 Kris 協助。",
                                                ephemeral=True)
                return
            # Keep pending on uncertain network errors so retries cannot spam DMs.
            self.store.finish(member.id, "sent", delivered.id)
            await interaction.followup.send("已私訊通知 Kris，請等待確認並手動授予音樂創作者身分組。",
                                            view=entry_links(), ephemeral=True)
        except (discord.HTTPException, OSError, sqlite3.Error, RuntimeError):
            log.exception("Guyun role notification did not complete")
            await interaction.followup.send("目前無法確認申請是否完成，請稍後再試或直接聯絡 Kris。",
                                            ephemeral=True)


def register_guyun_role_notification(bot) -> bool:
    recipients = {value.strip() for value in os.getenv("ROLE_REQUEST_ADMIN_IDS", "").split(",") if value.strip()}
    if (recipients != {str(RECIPIENT_ID)} or bot.settings.discord_guild_id != GUILD_ID
            or bot.settings.participant_role_id != ROLE_ID):
        log.error("Guyun role notification disabled: recipient/guild/role configuration mismatch")
        return False
    try:
        store = RequestStore("/data/guyun-role-requests.sqlite3")
    except (OSError, sqlite3.Error):
        log.exception("Guyun role notification disabled: request store unavailable")
        return False
    bot.add_view(GuyunRoleNotifyView(bot, store), message_id=MESSAGE_ID)
    log.info("Guyun role notification registered: message=%s recipient=%s", MESSAGE_ID, RECIPIENT_ID)
    return True
