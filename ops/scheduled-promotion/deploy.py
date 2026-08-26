"""Install the one-time noon timer on the host. Never sends: the preview stays read-only.

Run on the host as a user with passwordless sudo, before 2026-08-27 04:00 UTC.
Refuses to run twice, and refuses if anything has already claimed the announcement.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
UNITS = Path("/etc/systemd/system")
CONTAINER = "ai-song-contest"
REMOTE = "/data/scheduled-promotion-20260827-noon"
RECEIPT = "/data/guyun-announcement-20260827-noon.json"
SERVICE = "guyun-promotion-20260827-noon.service"
TIMER = "guyun-promotion-20260827-noon.timer"
PAYLOAD = ("send.py", "lookup.py")
WHEN = datetime(2026, 8, 27, 4, 0, tzinfo=timezone.utc)
DIGEST = "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())"


def run(*args, capture=True):
    result = subprocess.run(["sudo", "-n", *args], check=True, text=True,
                            capture_output=capture)
    return result.stdout.strip() if capture else None


def container(*args, **kwargs):
    return run("docker", "exec", "-e", "PYTHONIOENCODING=utf-8", CONTAINER, *args, **kwargs)


def preconditions():
    assert datetime.now(timezone.utc) < WHEN, "Past the scheduled time; do not install a late timer"
    for unit in (SERVICE, TIMER):
        assert not (UNITS / unit).exists(), f"{unit} already installed; review before redeploying"
    assert run("docker", "inspect", "-f", "{{.State.Running}}", CONTAINER) == "true"
    absent = container("python", "-c", "import os,sys;print(os.path.exists(sys.argv[1]))", RECEIPT)
    assert absent == "False", "A receipt already exists; the announcement may have been sent"


def stage():
    container("python", "-c", "import os,sys;os.makedirs(sys.argv[1],exist_ok=True)", REMOTE)
    for name in PAYLOAD:
        source = HERE / name
        run("docker", "cp", str(source), f"{CONTAINER}:{REMOTE}/{name}")
        landed = container("python", "-c", DIGEST, f"{REMOTE}/{name}")
        assert landed == hashlib.sha256(source.read_bytes()).hexdigest(), f"{name} did not copy intact"


def preview():
    """Read-only preflight inside the container. Without --send this cannot post."""
    result = json.loads(container("python", f"{REMOTE}/send.py"))
    assert result["status"] == "preview_only"
    assert result["channel_id"] == "1404736020834156584"
    assert result["scheduled_taipei"] == "2026-08-27T12:00:00+08:00"
    return result


def install():
    for unit in (SERVICE, TIMER):
        run("install", "-m", "0644", "-o", "root", "-g", "root", str(HERE / unit), str(UNITS / unit))
    run("systemd-analyze", "verify", str(UNITS / SERVICE), str(UNITS / TIMER))
    run("systemctl", "daemon-reload")
    run("systemctl", "enable", "--now", TIMER)


def confirm():
    assert run("systemctl", "is-enabled", TIMER) == "enabled"
    assert run("systemctl", "is-active", TIMER) == "active"
    elapse = run("systemctl", "show", TIMER, "-p", "NextElapseUSecRealtime", "--value")
    assert elapse, "Timer has no next elapse; the calendar expression did not parse"
    return elapse


def main():
    preconditions()
    stage()
    role = preview()["role_name"]
    install()
    print(json.dumps({"status": "installed", "timer": TIMER, "next_elapse": confirm(),
                      "role_name": role, "sent": False}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    sys.exit(main())
