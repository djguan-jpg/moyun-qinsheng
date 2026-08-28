"""Deploy direct home links to the gallery and admin dashboard."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
from typing import Optional

BACKEND = Path("/home/ubuntu/guyun-registration")
STAGE = BACKEND / ".stage-home-navigation-20260827"
BACKUP = BACKEND / ".backup-home-navigation-20260827"
TARGET = BACKEND / "moyun_backend/main.py"
OLD_HASH = "1bf10190027099f64bb62b22ecb7fd7396fa062cafde8298d749fd47bbe868eb"
OLD_IMAGE = "sha256:6ab4b5e98f2c88c63e28c5a1ffd2f5f9e3536353da77eaa3f438250840b1451d"
IMAGE = "guyun-registration-registration"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def docker(*args: str, capture: bool = False) -> Optional[str]:
    result = subprocess.run(
        ["sudo", "-n", "docker", *args], cwd=BACKEND, check=True,
        capture_output=capture, text=True,
    )
    return result.stdout.strip() if capture else None


assert digest(TARGET) == OLD_HASH, "Backend source changed; refusing overwrite"
assert docker("inspect", "--format", "{{.Image}}", "guyun-registration-registration-1", capture=True) == OLD_IMAGE
assert not BACKUP.exists(), "Backup already exists; refusing overwrite"
environment_before = digest(BACKEND / ".env")
BACKUP.mkdir(mode=0o700)
shutil.copy2(TARGET, BACKUP / "main.py")
rollback_tag = IMAGE + ":before-home-navigation-20260827"
docker("tag", OLD_IMAGE, rollback_tag)
docker(
    "build", "--network=none", "--build-arg", "BASE_IMAGE=" + rollback_tag,
    "-f", str(STAGE / "Dockerfile"), "-t", IMAGE, str(STAGE),
)
temporary = TARGET.with_name(".main.py.home-navigation-new")
assert not temporary.exists()
shutil.copyfile(STAGE / "main.py", temporary)
temporary.chmod(0o644)
os.replace(temporary, TARGET)
assert environment_before == digest(BACKEND / ".env")
docker(
    "compose", "-f", "docker-compose.yml", "-f", "docker-compose.production.yml",
    "up", "-d", "--no-build", "--no-deps", "registration",
)
print("Home navigation deployed; data, settings and audio unchanged.", flush=True)
