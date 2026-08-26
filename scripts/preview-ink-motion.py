"""Isolated local gallery with generated 24-second audio; no production data."""
import argparse
from array import array
import math
import os
from pathlib import Path
import sys
import tempfile
import wave

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8016)
args = parser.parse_args()
directory = Path(tempfile.mkdtemp(prefix="guyun-wandering-ink-"))
database = directory / "preview.sqlite3"
os.environ["DATABASE_PATH"] = str(database)
os.environ["PUBLIC_BASE_PATH"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from moyun_backend.main import initialise_database, open_database  # noqa: E402
import uvicorn  # noqa: E402

uploads = directory / "uploads"
uploads.mkdir()
audio = uploads / "generated-preview.wav"
rate = 22050
samples = array("h")
for index in range(rate * 24):
    t = index / rate
    amplitude = .24 + .12 * math.sin(t * 1.7) ** 2
    # A known silent interval makes the silence gate observable in the browser.
    if 10 <= t < 12:
        amplitude = 0
    envelope = min(1, t * 6, (24 - t) * 6)
    chord = (math.sin(t * math.tau * 220) + .45 * math.sin(t * math.tau * 330)
             + .25 * math.sin(t * math.tau * 440)) / 1.7
    samples.append(round(32767 * amplitude * envelope * chord))
if sys.byteorder != "little":
    samples.byteswap()
with wave.open(str(audio), "wb") as handle:
    handle.setparams((1, 2, rate, 0, "NONE", "not compressed"))
    handle.writeframes(samples.tobytes())
initialise_database(database)
with open_database(database) as connection:
    for number in range(1, 4):
        connection.execute(
            """INSERT INTO registrations
            (discord_user_id, discord_username, display_name, work_title, category,
             description, contact_email, audio_filename, audio_content_type, audio_size, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (f"preview-{number}", "preview", "Preview", "Generated audio", "test",
             "Local generated fixture", "", audio.name, "audio/wav", audio.stat().st_size,
             "2026-08-26 00:00:00 CST"),
        )
print(f"Isolated preview: http://127.0.0.1:{args.port}/works", flush=True)
uvicorn.run("moyun_backend.main:app", host="127.0.0.1", port=args.port)
