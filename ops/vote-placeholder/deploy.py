"""Deploy only the public voting-placeholder removal, with exact-version backups."""
import hashlib
import os
from pathlib import Path
import shutil

HOST = Path('/home/ubuntu/ai-song-contest')
SITE = HOST / 'moyun-qinsheng-site'
STAGE = HOST / '.stage-vote-placeholder-20260827'
BACKUP = HOST / '.backup-vote-placeholder-20260827'
EXPECTED = {
    'index.html': 'f9f1663bf1a9ed7f40cd32b4b52db6de3042af72b2a748b7dd624de279563a14',
    'app.js': 'd05119da273bcaab6989b434276b8fb00d54c322ef6861eedd8a59b8a08fd072',
}

for name, digest in EXPECTED.items():
    assert hashlib.sha256((SITE / name).read_bytes()).hexdigest() == digest, f'{name} changed; refusing overwrite'
    assert (STAGE / name).is_file()
assert not BACKUP.exists()
BACKUP.mkdir(mode=0o700)
for name in EXPECTED:
    shutil.copy2(SITE / name, BACKUP / name)
for name in ('app.js', 'index.html'):
    assert hashlib.sha256((SITE / name).read_bytes()).hexdigest() == EXPECTED[name]
    staged = SITE / ('.' + name + '.vote-placeholder-new')
    assert not staged.exists()
    shutil.copy2(STAGE / name, staged)
    staged.chmod((SITE / name).stat().st_mode & 0o777)
    os.replace(staged, SITE / name)
    print(name, hashlib.sha256((SITE / name).read_bytes()).hexdigest())
print('Voting preview removed; only index.html and app.js were changed. Backup retained.')
