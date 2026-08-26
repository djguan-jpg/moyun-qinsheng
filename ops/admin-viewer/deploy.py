"""Scoped host-side deploy; retains existing dependencies and all contest data."""
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path("/home/ubuntu/guyun-registration")
STAGE = ROOT / ".stage-admin-viewer-20260826"
BACKUP = ROOT / ".backup-admin-viewer-20260826"
EXPECTED_SOURCE = "65a155f26ca80b88d151f08dfd519a50b399448a714b29668474d3315ea95ca3"
EXPECTED_IMAGE = "sha256:a1808cacce3f92b51a532761322da84012a6148677ff91cef65af0f4384abe0f"
IMAGE = "guyun-registration-registration"
ROLLBACK_IMAGE = IMAGE + ":before-admin-viewer-20260826"
VIEWER = "804681154266398760"
KEY = "DISCORD_ADMIN_VIEWER_USER_IDS"


def docker(*args, capture=False):
    result = subprocess.run(["sudo", "-n", "docker", *args], cwd=ROOT, check=True,
                            capture_output=capture, text=True)
    return result.stdout.strip() if capture else None


def main():
    source = ROOT / "moyun_backend/main.py"
    assert hashlib.sha256(source.read_bytes()).hexdigest() == EXPECTED_SOURCE
    assert docker("inspect", "--format", "{{.Image}}", "guyun-registration-registration-1", capture=True) == EXPECTED_IMAGE
    assert not BACKUP.exists()
    config = ROOT / ".env"
    original = config.read_bytes()
    text = original.decode("utf-8")
    pattern = re.compile(r"^" + KEY + r"=([^\r\n]*)", re.MULTILINE)
    matches = pattern.findall(text)
    assert len(matches) <= 1
    viewers = [value.strip() for value in (matches[0].strip().strip('\"\'') if matches else "").split(",") if value.strip()]
    if VIEWER not in viewers:
        viewers.append(VIEWER)
    replacement = KEY + "=" + ",".join(viewers)
    newline = "\r\n" if "\r\n" in text else "\n"
    updated = pattern.sub(replacement, text) if matches else text + ("" if text.endswith("\n") else newline) + replacement + newline
    BACKUP.mkdir(mode=0o700)
    shutil.copy2(source, BACKUP / "main.py")
    shutil.copy2(config, BACKUP / ".env")
    os.chmod(BACKUP / ".env", 0o600)
    docker("tag", EXPECTED_IMAGE, ROLLBACK_IMAGE)
    # Inherit the exact running image: no dependency install or dependency update.
    docker("build", "--network=none", "--build-arg", "BASE_IMAGE=" + ROLLBACK_IMAGE,
           "-f", str(STAGE / "Dockerfile"), "-t", IMAGE, str(STAGE))
    assert config.read_bytes() == original, "Configuration changed during build; refusing overwrite"
    assert hashlib.sha256(source.read_bytes()).hexdigest() == EXPECTED_SOURCE
    shutil.copy2(STAGE / "main.py", source)
    temporary = ROOT / ".env.admin-viewer-new"
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(updated.encode("utf-8"))
    os.replace(temporary, config)
    docker("compose", "-f", "docker-compose.yml", "-f", "docker-compose.production.yml",
           "up", "-d", "--no-build", "--no-deps", "registration")
    print("Admin viewer deployment complete; existing admin settings and data retained.", flush=True)


if __name__ == "__main__":
    main()
