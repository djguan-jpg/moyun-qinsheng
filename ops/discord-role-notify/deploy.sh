#!/bin/sh
set -eu
cd /home/ubuntu/ai-song-contest
stage=/home/ubuntu/ai-song-contest/.stage-role-notify-20260826
backup=/home/ubuntu/ai-song-contest/.backup-role-notify-20260826
printf '%s\n' 'ed5a1c8c58255afbe51a18143b9534173764343e75caa9de4afc26a269dd5e03  app/discord_bot.py' | sha256sum -c -
printf '%s\n' 'f7e5740f8d6fe5df3b473731aea4099a2cf1db38f2a3c370e7b47a3e875cc2a6  app/config.py' | sha256sum -c -
test ! -e app/guyun_role_notify.py
test ! -e "$backup"
mkdir -m 700 "$backup"
cp -p app/discord_bot.py "$backup/discord_bot.py"
cp "$stage/discord_bot.py" app/discord_bot.py
cp "$stage/guyun_role_notify.py" app/guyun_role_notify.py
sudo -n docker compose up -d --build --no-deps app
printf '%s\n' 'Role notification deployment command completed.'
