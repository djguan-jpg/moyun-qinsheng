#!/bin/sh
set -eu

# Install this script as /usr/local/sbin/guyun-registration-backup on the host.
# It runs as root through the accompanying systemd service.
umask 077

service_directory=/home/ubuntu/guyun-registration
data_directory="$service_directory/data"
backup_directory="$service_directory/backups"
container_name=guyun-registration-registration-1
database_file=guyun-registration.sqlite3
snapshot_file=.guyun-registration-backup.sqlite3
lock_file=/run/guyun-registration-backup.lock

staging_directory=""
snapshot_path="$data_directory/$snapshot_file"

cleanup() {
    rm -f "$snapshot_path"
    if [ -n "$staging_directory" ]; then
        rm -rf "$staging_directory"
    fi
}

trap cleanup EXIT HUP INT TERM

exec 9>"$lock_file"
if ! flock -n 9; then
    exit 0
fi

test -d "$data_directory"
docker inspect --format '{{.State.Running}}' "$container_name" | grep -qx true
mkdir -p "$backup_directory"
staging_directory="$(mktemp -d "$backup_directory/.staging.XXXXXX")"
mkdir -p "$staging_directory/data"

latest_backup="$(find "$backup_directory" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*' -printf '%f\n' | sort | tail -n 1 || true)"
if [ -n "$latest_backup" ]; then
    # Existing audio files are hard-linked from the previous snapshot when unchanged.
    rsync -a --link-dest="$backup_directory/$latest_backup/data" --exclude="${database_file}*" --exclude="$snapshot_file" "$data_directory/" "$staging_directory/data/"
else
    rsync -a --exclude="${database_file}*" --exclude="$snapshot_file" "$data_directory/" "$staging_directory/data/"
fi

# SQLite's backup API creates a transactionally consistent database snapshot.
rm -f "$snapshot_path"
docker exec "$container_name" python -c "import sqlite3; source = sqlite3.connect('/app/data/guyun-registration.sqlite3'); destination = sqlite3.connect('/app/data/.guyun-registration-backup.sqlite3'); source.backup(destination); destination.close(); source.close()"
install -m 0600 "$snapshot_path" "$staging_directory/data/$database_file"

# A second non-destructive pass includes audio that arrived while SQLite was being snapshotted.
# Retaining files removed during that short window keeps every database reference restorable.
rsync -a --exclude="${database_file}*" --exclude="$snapshot_file" "$data_directory/" "$staging_directory/data/"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
final_directory="$backup_directory/$timestamp"
if [ -e "$final_directory" ]; then
    final_directory="$final_directory-$$"
fi
printf 'created_at_utc=%s\nsource_data_directory=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$data_directory" > "$staging_directory/backup-info.txt"
mv "$staging_directory" "$final_directory"
staging_directory=""
