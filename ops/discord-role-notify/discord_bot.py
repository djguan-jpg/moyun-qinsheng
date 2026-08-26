from __future__ import annotations

import asyncio
import io
import logging
import time
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import discord
from discord import app_commands
from discord.ext import commands, tasks

from .config import Settings
from .database import Database
from .guyun_role_notify import register_guyun_role_notification
from .models import Registration
from .services import (
    claim_promotion_slot,
    claim_runoff_promotion_slot,
    count_registrations,
    get_activity_schedule,
    get_by_discord_id,
    get_by_serial,
    get_vote_for_voter,
    is_registration_open,
    is_runner_up_runoff_open,
    is_runoff_open,
    is_voting_open,
    public_song_url,
    registrations_csv,
    runner_up_runoff_period,
    runoff_period,
    winner_result,
)

log = logging.getLogger(__name__)
TAIPEI_TIMEZONE = ZoneInfo("Asia/Taipei")


def promotion_slot(
    now: datetime,
    weekday_start_hour: int = 9,
    weekday_end_hour: int = 21,
    weekend_start_hour: int = 10,
    weekend_end_hour: int = 23,
    interval_hours: int = 3,
) -> str | None:
    if now.minute != 0:
        return None

    hour = now.hour
    is_weekend = now.weekday() >= 5
    start_hour = weekend_start_hour if is_weekend else weekday_start_hour
    end_hour = weekend_end_hour if is_weekend else weekday_end_hour
    if (
        interval_hours <= 0
        or hour < start_hour
        or hour > min(end_hour, 23)
        or (hour - start_hour) % interval_hours != 0
    ):
        return None
    return f"{now.date().isoformat()}T{now.strftime('%H:%M')}"


def runoff_campaign_slot(
    now: datetime,
    campaign_date: str,
    campaign_times: tuple[str, ...],
) -> str | None:
    current_date = now.date().isoformat()
    current_time = now.strftime("%H:%M")
    if current_date != campaign_date or current_time not in campaign_times:
        return None
    return f"runoff:{current_date}T{current_time}"


def _promotion_datetime(value: datetime | None) -> str:
    if value is None:
        return "未設定"
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(TAIPEI_TIMEZONE).strftime("%Y/%m/%d %H:%M")


def _promotion_period(start_at: datetime | None, end_at: datetime | None) -> str:
    return f"{_promotion_datetime(start_at)}－{_promotion_datetime(end_at)}"


def build_promotion_embed(
    app_base_url: str,
    *,
    submission_deadline: str = "請見活動網站",
    voting_period: str = "請見活動網站",
) -> discord.Embed:
    embed = discord.Embed(
        title="🎤 AI 台語歌曲創作大賽｜投稿進行中",
        description=(
            "用 AI 創作你的歌曲，讓大家聽見你的音樂創意！\n\n"
            "🎶 **不限制一定要唱台語，有台語會更棒！**\n"
            "🎨 **風格不限、題材不限，自由發揮。**"
        ),
        color=0xFF6B24,
        url=app_base_url,
    )
    embed.add_field(
        name="🎵 參賽資格",
        value="持有「🎵｜音樂創作者」身分組的成員即可投稿。",
        inline=False,
    )
    embed.add_field(
        name="🏆 最優勝獎金",
        value="最優勝者可以得到獎金新台幣 **1,000 元整**！",
        inline=False,
    )
    embed.add_field(
        name="🎁 主委加碼",
        value="參賽作品超過 25 件，主委加碼增設 **2 獎、獎金 500 元**。",
        inline=False,
    )
    embed.add_field(
        name="📅 活動日期（台北時間）",
        value=(
            f"投稿截止：**{submission_deadline}**\n"
            f"投票期間：**{voting_period}**"
        ),
        inline=False,
    )
    embed.add_field(
        name="🌐 活動網站",
        value="登入投稿、替換作品檔案，以及匿名聆聽參賽作品。",
        inline=False,
    )
    embed.add_field(
        name="🤖 Bot 指令教學",
        value=(
            "`/報名`　取得網站登入與投稿連結\n"
            "`/領取身分組`　向管理員申請音樂創作者身分組\n"
            "`/投票`　前往聆聽作品與投票\n"
            "`/我的報名`　查詢自己的參賽資料\n"
            "`/我的投票`　查看目前投給哪件作品"
        ),
        inline=False,
    )
    embed.set_footer(text="AI x 台語｜用創意唱出新聲音")
    return embed


def build_voting_promotion_embed(
    app_base_url: str,
    *,
    voting_deadline: str = "請見活動網站",
) -> discord.Embed:
    embed = discord.Embed(
        title="🗳️ AI 台語歌曲創作大賽｜投票現正開放",
        description=(
            "現在開放所有 Discord 成員匿名聆聽與投票！\n\n"
            "每個帳號都有 **2 張票**，請把票投給你最喜歡的作品。"
        ),
        color=0xFF6B24,
        url=f"{app_base_url.rstrip('/')}/vote",
    )
    embed.add_field(
        name="🎫 投票規則",
        value=(
            "每個 Discord 帳號有 **2 張票**；兩張票必須投給 **不同作品**，"
            "不能重複投給同一首歌。"
        ),
        inline=False,
    )
    embed.add_field(
        name="📅 投票截止（台北時間）",
        value=f"**{voting_deadline}**",
        inline=False,
    )
    embed.add_field(
        name="🎧 匿名聆聽",
        value="作品以匿名編號呈現，請依作品內容選出你的最愛。",
        inline=False,
    )
    embed.set_footer(text="AI x 台語｜用創意唱出新聲音")
    return embed


def build_runoff_promotion_embed(
    app_base_url: str,
    *,
    championship_period: str,
    runner_up_period: str,
) -> discord.Embed:
    embed = discord.Embed(
        title="⚖️ AI 台語歌曲創作大賽｜匿名平票加賽進行中",
        description=(
            "兩場 48 小時匿名加賽已開放！\n\n"
            "🏆 **3 票組平票決選**：3 件作品\n"
            "🥈 **亞軍平票決選**：所有原始 2 票作品\n\n"
            "每位登入 Discord 的成員在兩場加賽中 **各有一張票**，彼此獨立，無需先報名。"
        ),
        color=0xD9A52E,
        url=f"{app_base_url.rstrip('/')}/runoff",
    )
    embed.add_field(
        name="🏆 3 票組加賽期間（台北時間）",
        value=f"**{championship_period}**",
        inline=False,
    )
    embed.add_field(
        name="🥈 亞軍加賽期間（台北時間）",
        value=f"**{runner_up_period}**",
        inline=False,
    )
    embed.add_field(
        name="🎧 匿名投票規則",
        value="作者、歌名與原序號不公開；每場一票、送出後不可更改，也不能投自己的作品。",
        inline=False,
    )
    embed.set_footer(text="AI x 台語｜請把握 48 小時加賽")
    return embed


def build_lyrics_feature_embed(app_base_url: str) -> discord.Embed:
    base_url = app_base_url.rstrip("/")
    embed = discord.Embed(
        title="📝 網站新功能｜歌詞上傳已開放",
        description=(
            "參賽者現在可以在投稿時一併上傳歌詞，"
            "已投稿的作品也能從作品修改頁補上或替換歌詞！"
        ),
        color=0xFF7A21,
        url=f"{base_url}/register",
    )
    embed.add_field(
        name="支援格式",
        value="UTF-8 編碼的 **TXT／LRC／SRT**，檔案最大 **512 KB**。",
        inline=False,
    )
    embed.add_field(
        name="網站功能",
        value="歌詞會顯示在作品頁與匿名聆聽頁，方便大家邊聽邊看。",
        inline=False,
    )
    embed.add_field(
        name="前往網站",
        value=f"[登入投稿或修改作品]({base_url}/auth/login)",
        inline=False,
    )
    embed.set_footer(text="AI x 台語｜歌詞上傳功能更新")
    return embed


def participant_role_channel_url(guild_id: int, channel_id: int) -> str:
    return f"https://discord.com/channels/{guild_id}/{channel_id}"


def role_request_recipient_ids(
    configured_admin_ids: tuple[int, ...],
    owner_id: int | None,
    cached_admin_ids: tuple[int, ...],
    requester_id: int,
) -> set[int]:
    if configured_admin_ids:
        recipient_ids = set(configured_admin_ids)
    else:
        recipient_ids = set(cached_admin_ids)
        if owner_id:
            recipient_ids.add(owner_id)
    recipient_ids.discard(requester_id)
    return recipient_ids


def build_role_guide_embed(
    app_base_url: str,
    guild_id: int,
    channel_id: int,
) -> discord.Embed:
    embed = discord.Embed(
        title="🎵 音樂創作者身分組申請",
        description=(
            "Bot 已將你的申請私訊給伺服器管理員。\n\n"
            "1. 請等待管理員確認申請。\n"
            "2. 管理員會在 Discord **手動授予**「🎵｜音樂創作者」。\n"
            "3. 取得身分組後，回到網站重新驗證即可投稿。"
        ),
        color=0xFF7A21,
    )
    embed.add_field(
        name="提醒",
        value="重複操作不會加快審核；若長時間未處理，請直接聯絡伺服器管理員。",
        inline=False,
    )
    embed.set_footer(text="身分組不會由 Bot 自動發放")
    return embed


def build_role_guide_view(
    app_base_url: str,
    guild_id: int,
    channel_id: int,
) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(
        discord.ui.Button(
            label="重新檢查身分組",
            url=f"{app_base_url.rstrip('/')}/auth/login?next=/register",
            emoji="🔄",
        )
    )
    view.add_item(
        discord.ui.Button(
            label="先聆聽參賽作品",
            url=f"{app_base_url.rstrip('/')}/vote",
            emoji="🎧",
        )
    )
    return view


def build_role_request_admin_embed(
    *,
    display_name: str,
    username: str,
    user_id: int,
    guild_name: str,
    role_name: str,
) -> discord.Embed:
    embed = discord.Embed(
        title="🎵 音樂創作者身分組申請",
        description=(
            "有使用者希望參加 AI 台語歌曲創作大賽。"
            "請確認後，由管理員在 Discord 成員名單中手動授予身分組。"
        ),
        color=0xFF7A21,
    )
    embed.add_field(name="顯示名稱", value=display_name, inline=True)
    embed.add_field(name="Discord 使用者名稱", value=f"@{username}", inline=True)
    embed.add_field(name="Discord User ID", value=f"`{user_id}`", inline=False)
    embed.add_field(name="伺服器", value=guild_name, inline=True)
    embed.add_field(name="申請身分組", value=role_name, inline=True)
    embed.set_footer(text="此通知不會自動授予身分組")
    return embed


def build_promotion_view(app_base_url: str) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(
        discord.ui.Button(
            label="立即登入投稿",
            url=f"{app_base_url.rstrip('/')}/auth/login",
            emoji="🎤",
        )
    )
    view.add_item(
        discord.ui.Button(
            label="匿名聆聽作品",
            url=f"{app_base_url.rstrip('/')}/vote",
            emoji="🎧",
        )
    )
    return view


def build_voting_promotion_view(app_base_url: str) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(
        discord.ui.Button(
            label="立即匿名聆聽與投票",
            url=f"{app_base_url.rstrip('/')}/vote",
            emoji="🗳️",
        )
    )
    return view


def build_runoff_promotion_view(app_base_url: str) -> discord.ui.View:
    base_url = app_base_url.rstrip("/")
    view = discord.ui.View(timeout=None)
    view.add_item(
        discord.ui.Button(
            label="3 票組匿名加賽",
            url=f"{base_url}/runoff",
            emoji="🏆",
        )
    )
    view.add_item(
        discord.ui.Button(
            label="亞軍匿名加賽",
            url=f"{base_url}/runner-up-runoff",
            emoji="🥈",
        )
    )
    return view


class ContestBot(commands.Bot):
    def __init__(self, settings: Settings, database: Database) -> None:
        intents = discord.Intents.default()
        super().__init__(command_prefix="!", intents=intents)
        self.settings = settings
        self.database = database
        self._commands_registered = False
        self._role_request_sent_at: dict[int, float] = {}
        self._winner_role_synced_for: int | None = None

    async def setup_hook(self) -> None:
        register_guyun_role_notification(self)
        self._register_commands()
        guild = discord.Object(id=self.settings.discord_guild_id)
        self.tree.copy_global_to(guild=guild)
        await self.tree.sync(guild=guild)
        log.info("Slash commands synced to guild %s", self.settings.discord_guild_id)
        if not self.promotion_scheduler.is_running():
            self.promotion_scheduler.start()
        if not self.winner_role_scheduler.is_running():
            self.winner_role_scheduler.start()

    def _register_commands(self) -> None:
        if self._commands_registered:
            return
        self._commands_registered = True

        @self.tree.command(name="報名", description="取得古韻新生投稿連結")
        async def register(interaction: discord.Interaction) -> None:
            view = discord.ui.View()
            view.add_item(
                discord.ui.Button(
                    label="前往古韻新生投稿",
                    url="https://moyun.161-33-185-80.sslip.io/guyun/register",
                    emoji="🎤",
                )
            )
            await interaction.response.send_message(
                "古韻新生古風音樂大賽現正開放投稿。\n"
                "點擊下方按鈕使用 Discord 登入；系統會確認你是否持有"
                "「🎵｜音樂創作者」身分組。\n"
                "登入後可提交古風音樂作品，並可在報名截止前修改資料或替換音檔。",
                view=view,
                ephemeral=True,
            )

        @self.tree.command(name="領取身分組", description="向管理員申請音樂創作者身分組")
        async def role_guide(interaction: discord.Interaction) -> None:
            await interaction.response.defer(ephemeral=True)
            request_status, notified_admins = await self.request_participant_role(
                interaction.user.id
            )
            if request_status == "already_member":
                message = "你已持有「🎵｜音樂創作者」身分組，可以直接前往網站投稿。"
            elif request_status == "recently_sent":
                message = "你的申請已在一小時內送出，請等待管理員手動處理。"
            elif request_status == "sent":
                message = (
                    f"申請已私訊 **{notified_admins} 位管理員**。"
                    "管理員確認後會手動授予身分組。"
                )
            else:
                message = (
                    "目前無法私訊管理員，請直接聯絡伺服器管理員協助授予"
                    "「🎵｜音樂創作者」身分組。"
                )
            await interaction.followup.send(
                message,
                view=build_role_guide_view(
                    self.settings.app_base_url,
                    self.settings.discord_guild_id,
                    self.settings.participant_role_channel_id,
                ),
                ephemeral=True,
            )

        @self.tree.command(name="我的報名", description="查詢自己的參賽編號")
        async def my_registration(interaction: discord.Interaction) -> None:
            with self.database.session_factory() as db:
                item = get_by_discord_id(db, interaction.user.id)
            if not item:
                await interaction.response.send_message("目前查不到你的報名資料。", ephemeral=True)
                return
            registration_url = (
                f"{self.settings.app_base_url.rstrip('/')}/success/{item.serial_number}"
            )
            await interaction.response.send_message(
                f"參賽編號：**{item.serial_number}**\n"
                f"作品：**{item.song_title}**\n"
                f"作品管理頁：{registration_url}",
                ephemeral=True,
            )

        @self.tree.command(name="投票", description="開啟 AI 台語歌曲參賽作品投票頁")
        async def vote(interaction: discord.Interaction) -> None:
            view = discord.ui.View()
            view.add_item(
                discord.ui.Button(
                    label="聆聽作品／參賽者投票",
                    url=f"{self.settings.app_base_url}/vote",
                    emoji="🗳️",
                )
            )
            await interaction.response.send_message(
                "所有人都能聆聽參賽作品；只有持有「🎵｜音樂創作者」"
                "身分組並完成報名的參賽者可以投票。",
                view=view,
                ephemeral=True,
            )

        @self.tree.command(name="我的投票", description="查看自己目前投給哪件作品")
        async def my_vote(interaction: discord.Interaction) -> None:
            with self.database.session_factory() as db:
                voter = get_by_discord_id(db, interaction.user.id)
                current_vote = get_vote_for_voter(db, voter.id) if voter else None
                candidate = (
                    db.get(Registration, current_vote.candidate_registration_id)
                    if current_vote
                    else None
                )
            if voter is None:
                await interaction.response.send_message(
                    "只有已完成報名的參賽者可以投票。", ephemeral=True
                )
                return
            if candidate is None:
                await interaction.response.send_message(
                    "你目前還沒有投票。輸入 `/投票` 前往作品頁。",
                    ephemeral=True,
                )
                return
            await interaction.response.send_message(
                f"你目前投給：**{candidate.serial_number}｜{candidate.song_title}**\n"
                "投票開放期間可使用 `/投票` 修改。",
                ephemeral=True,
            )

        @self.tree.command(name="報名查詢", description="管理員依參賽編號查詢報名")
        @app_commands.default_permissions(administrator=True)
        @app_commands.describe(serial_number="例如 TWAI-000001")
        async def admin_lookup(
            interaction: discord.Interaction, serial_number: str
        ) -> None:
            if not self._is_admin(interaction):
                await interaction.response.send_message("你沒有管理員權限。", ephemeral=True)
                return
            with self.database.session_factory() as db:
                item = get_by_serial(db, serial_number)
            if not item:
                await interaction.response.send_message("查無此參賽編號。", ephemeral=True)
                return
            song_url = public_song_url(item.song_url, self.settings.app_base_url)
            await interaction.response.send_message(
                "\n".join(
                    [
                        f"**{item.serial_number}｜{item.song_title}**",
                        f"Discord：{item.discord_display_name} (`{item.discord_user_id}`)",
                        f"音訊：{song_url}",
                        f"檔名：{item.audio_original_name or '舊版連結投稿'}",
                        f"簡介：{item.description or '—'}",
                        f"時間：{item.created_at.isoformat()}",
                    ]
                ),
                ephemeral=True,
            )

        @self.tree.command(name="報名統計", description="管理員查看目前報名人數")
        @app_commands.default_permissions(administrator=True)
        async def admin_count(interaction: discord.Interaction) -> None:
            if not self._is_admin(interaction):
                await interaction.response.send_message("你沒有管理員權限。", ephemeral=True)
                return
            with self.database.session_factory() as db:
                total = count_registrations(db)
            await interaction.response.send_message(f"目前共有 **{total}** 人報名。", ephemeral=True)

        @self.tree.command(name="匯出報名", description="管理員匯出 CSV 報名名單")
        @app_commands.default_permissions(administrator=True)
        async def admin_export(interaction: discord.Interaction) -> None:
            if not self._is_admin(interaction):
                await interaction.response.send_message("你沒有管理員權限。", ephemeral=True)
                return
            await interaction.response.defer(ephemeral=True)
            with self.database.session_factory() as db:
                data = registrations_csv(db, self.settings.app_base_url)
            file = discord.File(io.BytesIO(data), filename="contest-registrations.csv")
            await interaction.followup.send("報名名單如下：", file=file, ephemeral=True)

    @staticmethod
    def _is_admin(interaction: discord.Interaction) -> bool:
        return bool(
            isinstance(interaction.user, discord.Member)
            and interaction.user.guild_permissions.administrator
        )

    async def send_registration_dm(
        self, discord_user_id: int, serial_number: str, song_title: str
    ) -> bool:
        try:
            user = self.get_user(discord_user_id) or await self.fetch_user(discord_user_id)
            await user.send(
                "🎉 **AI 台語歌曲大賽報名成功！**\n\n"
                f"參賽編號：**{serial_number}**\n"
                f"作品：**{song_title}**\n\n"
                "🏆 最優勝者可以得到獎金新台幣 **1,000 元整**！\n\n"
                "請妥善保存參賽編號，祝你比賽順利！"
            )
            return True
        except (discord.Forbidden, discord.HTTPException):
            log.warning("Unable to DM Discord user %s", discord_user_id)
            return False

    async def request_participant_role(self, discord_user_id: int) -> tuple[str, int]:
        guild = self.get_guild(self.settings.discord_guild_id)
        if guild is None:
            log.warning("Unable to request participant role: guild is unavailable")
            return ("failed", 0)

        try:
            member = guild.get_member(discord_user_id) or await guild.fetch_member(
                discord_user_id
            )
        except (discord.Forbidden, discord.HTTPException, discord.NotFound):
            log.warning(
                "Unable to resolve participant role requester %s",
                discord_user_id,
            )
            return ("failed", 0)

        if any(
            role.id == self.settings.participant_role_id for role in member.roles
        ):
            return ("already_member", 0)

        now = time.monotonic()
        last_sent_at = self._role_request_sent_at.get(discord_user_id)
        if last_sent_at is not None and now - last_sent_at < 3600:
            return ("recently_sent", 0)

        role = guild.get_role(self.settings.participant_role_id)
        cached_admin_ids = tuple(
            candidate.id
            for candidate in guild.members
            if candidate.guild_permissions.administrator and not candidate.bot
        )
        admin_ids = role_request_recipient_ids(
            self.settings.role_request_admin_ids,
            guild.owner_id,
            cached_admin_ids,
            discord_user_id,
        )

        admin_embed = build_role_request_admin_embed(
            display_name=member.display_name,
            username=member.name,
            user_id=member.id,
            guild_name=guild.name,
            role_name=role.name if role is not None else "🎵｜音樂創作者",
        )
        server_view = discord.ui.View(timeout=None)
        server_view.add_item(
            discord.ui.Button(
                label="開啟 Discord 伺服器",
                url=f"https://discord.com/channels/{guild.id}",
                emoji="🛡️",
            )
        )

        notified_admins = 0
        for admin_id in admin_ids:
            try:
                admin = self.get_user(admin_id) or await self.fetch_user(admin_id)
                if admin.bot:
                    continue
                await admin.send(embed=admin_embed, view=server_view)
                notified_admins += 1
            except (discord.Forbidden, discord.HTTPException, discord.NotFound):
                log.warning(
                    "Unable to send participant role request to administrator %s",
                    admin_id,
                )

        if notified_admins == 0:
            return ("failed", 0)

        self._role_request_sent_at[discord_user_id] = now
        try:
            await member.send(
                embed=build_role_guide_embed(
                    self.settings.app_base_url,
                    self.settings.discord_guild_id,
                    self.settings.participant_role_channel_id,
                ),
                view=build_role_guide_view(
                    self.settings.app_base_url,
                    self.settings.discord_guild_id,
                    self.settings.participant_role_channel_id,
                ),
            )
        except (discord.Forbidden, discord.HTTPException):
            log.warning(
                "Unable to send role request confirmation to Discord user %s",
                discord_user_id,
            )
        log.info(
            "Participant role request from %s sent to %s administrator(s)",
            discord_user_id,
            notified_admins,
        )
        return ("sent", notified_admins)

    def _promotion_channels(self) -> list[discord.TextChannel]:
        guild = self.get_guild(self.settings.discord_guild_id)
        if guild is None:
            return []
        targets = tuple(
            name.casefold() for name in self.settings.promotion_channel_names
        )
        return [
            channel
            for channel in guild.text_channels
            if any(target in channel.name.casefold() for target in targets)
        ]

    @tasks.loop(seconds=30)
    async def promotion_scheduler(self) -> None:
        now = datetime.now(TAIPEI_TIMEZONE)
        campaign_slot = runoff_campaign_slot(
            now,
            self.settings.runoff_promotion_date,
            self.settings.runoff_promotion_times,
        )
        if campaign_slot is not None:
            channels = self._promotion_channels()
            if not channels:
                log.warning(
                    "Runoff promotion channels not found: configured=%s",
                    ", ".join(self.settings.promotion_channel_names),
                )
                return
            with self.database.session_factory() as db:
                championship_open = is_runoff_open(db, now)
                runner_up_open = is_runner_up_runoff_open(db, now)
                if not (championship_open or runner_up_open):
                    return
                if not claim_runoff_promotion_slot(db, campaign_slot):
                    return
                championship_period = _promotion_period(*runoff_period(db))
                runner_up_period_text = _promotion_period(
                    *runner_up_runoff_period(db)
                )
            embed = build_runoff_promotion_embed(
                self.settings.app_base_url,
                championship_period=championship_period,
                runner_up_period=runner_up_period_text,
            )
            view = build_runoff_promotion_view(self.settings.app_base_url)
            is_final_runoff_announcement = (
                campaign_slot == "runoff:2026-08-18T21:30"
            )
            announcement_content = (
                f"<@&{self.settings.participant_role_id}> 最後提醒：平票加賽將於今晚結束，請把握最後投票時間！"
                if is_final_runoff_announcement
                else None
            )
            announcement_mentions = (
                discord.AllowedMentions(
                    everyone=False,
                    users=False,
                    roles=True,
                    replied_user=False,
                )
                if is_final_runoff_announcement
                else discord.AllowedMentions.none()
            )
            sent = 0
            for channel in channels:
                try:
                    await channel.send(
                        content=announcement_content,
                        embed=embed,
                        view=view,
                        allowed_mentions=announcement_mentions,
                    )
                    sent += 1
                except (discord.Forbidden, discord.HTTPException):
                    log.exception(
                        "Unable to send runoff promotion to channel %s (%s)",
                        channel.name,
                        channel.id,
                    )
            log.info(
                "Runoff promotion slot %s sent to %s/%s channels",
                campaign_slot,
                sent,
                len(channels),
            )
            return

        slot = promotion_slot(
            now,
            weekday_start_hour=self.settings.promotion_start_hour,
            weekday_end_hour=self.settings.promotion_weekday_end_hour,
            weekend_start_hour=self.settings.promotion_weekend_start_hour,
            weekend_end_hour=self.settings.promotion_weekend_end_hour,
            interval_hours=self.settings.promotion_interval_hours,
        )
        if slot is None:
            return

        channels = self._promotion_channels()
        if not channels:
            log.warning(
                "Promotion channels not found: configured=%s",
                ", ".join(self.settings.promotion_channel_names),
            )
            return

        with self.database.session_factory() as db:
            voting_open = is_voting_open(db, now)
            submission_open = is_registration_open(db, now)
            if not (submission_open or voting_open):
                return
            if not claim_promotion_slot(db, slot, now):
                return
            schedule = get_activity_schedule(db)
            submission_deadline = _promotion_datetime(schedule.submission_end_at)
            voting_period = _promotion_period(
                schedule.voting_start_at,
                schedule.voting_end_at,
            )

        if voting_open:
            embed = build_voting_promotion_embed(
                self.settings.app_base_url,
                voting_deadline=_promotion_datetime(schedule.voting_end_at),
            )
            view = build_voting_promotion_view(self.settings.app_base_url)
        else:
            embed = build_promotion_embed(
                self.settings.app_base_url,
                submission_deadline=submission_deadline,
                voting_period=voting_period,
            )
            view = build_promotion_view(self.settings.app_base_url)

        sent = 0
        for channel in channels:
            try:
                await channel.send(
                    embed=embed,
                    view=view,
                    allowed_mentions=discord.AllowedMentions.none(),
                )
                sent += 1
            except (discord.Forbidden, discord.HTTPException):
                log.exception(
                    "Unable to send scheduled promotion to channel %s (%s)",
                    channel.name,
                    channel.id,
                )
        log.info(
            "Scheduled promotion slot %s sent to %s/%s channels",
            slot,
            sent,
            len(channels),
        )

    @tasks.loop(minutes=5)
    async def winner_role_scheduler(self) -> None:
        """Grant the configured Discord role once voting has officially ended."""
        with self.database.session_factory() as db:
            schedule = get_activity_schedule(db)
            voting_end = schedule.voting_end_at
            if voting_end is None:
                return
            if voting_end.tzinfo is None:
                voting_end = voting_end.replace(tzinfo=UTC)
            if datetime.now(UTC) < voting_end:
                return
            winner = winner_result(db)

        if winner is None or self._winner_role_synced_for == winner.registration.id:
            return
        guild = self.get_guild(self.settings.discord_guild_id)
        if guild is None:
            return

        role = (
            guild.get_role(self.settings.winner_role_id)
            if self.settings.winner_role_id
            else discord.utils.get(guild.roles, name=self.settings.winner_role_name)
        )
        if role is None:
            try:
                role = await guild.create_role(
                    name=self.settings.winner_role_name,
                    colour=discord.Colour.gold(),
                    reason="AI 台語歌曲大賽最高票冠軍榮譽",
                )
            except (discord.Forbidden, discord.HTTPException):
                log.exception("Unable to create winner role %s", self.settings.winner_role_name)
                return

        try:
            member = guild.get_member(winner.registration.discord_user_id)
            if member is None:
                member = await guild.fetch_member(winner.registration.discord_user_id)
            if role not in member.roles:
                await member.add_roles(role, reason="AI 台語歌曲大賽最高票冠軍榮譽")
            self._winner_role_synced_for = winner.registration.id
            log.info(
                "Winner role synced: registration=%s member=%s role=%s",
                winner.registration.serial_number,
                member.id,
                role.name,
            )
        except (discord.Forbidden, discord.HTTPException, discord.NotFound):
            log.exception(
                "Unable to assign winner role to Discord user %s",
                winner.registration.discord_user_id,
            )

    @promotion_scheduler.before_loop
    async def before_promotion_scheduler(self) -> None:
        await self.wait_until_ready()
        channels = self._promotion_channels()
        log.info(
            "Promotion scheduler active: timezone=Asia/Taipei "
            "every=%dh weekdays=%02d:00-%02d:00, weekends=%02d:00-%02d:00 "
            "channels=%s",
            self.settings.promotion_interval_hours,
            self.settings.promotion_start_hour,
            self.settings.promotion_weekday_end_hour,
            self.settings.promotion_weekend_start_hour,
            self.settings.promotion_weekend_end_hour,
            ", ".join(f"{channel.name} ({channel.id})" for channel in channels)
            or "none",
        )
        if self.settings.runoff_promotion_date:
            log.info(
                "Runoff campaign scheduled: date=%s slots=%s timezone=Asia/Taipei",
                self.settings.runoff_promotion_date,
                ",".join(self.settings.runoff_promotion_times),
            )

    @winner_role_scheduler.before_loop
    async def before_winner_role_scheduler(self) -> None:
        await self.wait_until_ready()

    async def close(self) -> None:
        if self.promotion_scheduler.is_running():
            self.promotion_scheduler.cancel()
        if self.winner_role_scheduler.is_running():
            self.winner_role_scheduler.cancel()
        await super().close()


async def run_bot(bot: ContestBot, token: str) -> None:
    while True:
        try:
            await bot.start(token)
            return
        except asyncio.CancelledError:
            if not bot.is_closed():
                await bot.close()
            raise
