"""Read-only check of the installed timer. Safe to run at any time, before or after noon.

Reports whether the announcement is still pending or already sent; never sends and
never edits anything.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from deploy import CONTAINER, DIGEST, PAYLOAD, RECEIPT, REMOTE, SERVICE, TIMER, UNITS, container, run

HERE = Path(__file__).resolve().parent
READ = "import os,sys;print(open(sys.argv[1],encoding='utf-8').read() if os.path.exists(sys.argv[1]) else '')"


def units_match_this_directory():
    for unit in (SERVICE, TIMER):
        installed = run("cat", str(UNITS / unit), capture=True)
        assert installed == (HERE / unit).read_text(encoding="utf-8").rstrip("\n"), \
            f"{unit} on the host differs from this directory"


def staged_scripts_match():
    for name in PAYLOAD:
        landed = container("python", "-c", DIGEST, f"{REMOTE}/{name}")
        assert landed == hashlib.sha256((HERE / name).read_bytes()).hexdigest(), \
            f"{name} in the container differs from this directory"


def receipt():
    raw = container("python", "-c", READ, RECEIPT)
    return json.loads(raw) if raw else None


def main():
    units_match_this_directory()
    staged_scripts_match()
    state = {"timer_enabled": run("systemctl", "is-enabled", TIMER),
             "timer_active": run("systemctl", "is-active", TIMER),
             "next_elapse": run("systemctl", "show", TIMER, "-p", "NextElapseUSecRealtime", "--value"),
             "last_result": run("systemctl", "show", SERVICE, "-p", "Result", "--value")}
    current = receipt()
    state["announcement"] = current or {"status": "not_sent"}
    if current and current.get("status") == "verified":
        assert current["channel_id"] == "1404736020834156584"
        assert current["role_id"] == "977847655759765514"
    print(json.dumps(state, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    sys.exit(main())
