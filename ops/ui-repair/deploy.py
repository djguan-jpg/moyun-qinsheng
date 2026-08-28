"""Publish missing pet assets, rule navigation and gallery back link only."""
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess

BOT_ROOT = Path('/home/ubuntu/ai-song-contest')
SITE = BOT_ROOT / 'moyun-qinsheng-site'
BACKEND = Path('/home/ubuntu/guyun-registration')
STAGE = BOT_ROOT / '.stage-ui-repair-20260827'
BACKUP = BOT_ROOT / '.backup-ui-repair-20260827'
IMAGE = 'guyun-registration-registration'
OLD_IMAGE = 'sha256:f65eeea01c4dd8a2c7457aef73114f492b9f036f98b39b48eb10106e00739981'
EXPECTED = {
    SITE / 'index.html': '3bbc1f485afd1b63a2159f44bcc8a19b32b68ecd6e75c45771d38ac1edef1707',
    SITE / 'app.js': '37091df5232775d809756eee722b961e1332cdb2e4e6b3fc48fa596eecb0945e',
    BACKEND / 'moyun_backend/main.py': '4ec20b1a1772591b30d1b88525470546344c9acaa24aa6b083b2b518061b1e16',
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def docker(*args, capture=False):
    result = subprocess.run(['sudo', '-n', 'docker', *args], cwd=BACKEND, check=True,
                            capture_output=capture, text=True)
    return result.stdout.strip() if capture else None


def publish(source, target):
    temporary = target.with_name('.' + target.name + '.ui-repair-new')
    assert not temporary.exists()
    shutil.copyfile(source, temporary)
    temporary.chmod(0o644)
    os.replace(temporary, target)


for path, expected in EXPECTED.items():
    assert digest(path) == expected, f'{path.name} changed; refusing overwrite'
assert docker('inspect', '--format', '{{.Image}}', 'guyun-registration-registration-1', capture=True) == OLD_IMAGE
for name in ('mingyun-integration.js', 'mingyun-integration.css', 'vendor/mingyun'):
    assert not (SITE / name).exists(), f'{name} now exists; review before overwrite'
assert not (BACKEND / 'moyun_backend/static/gallery-navigation.js').exists()
assert not BACKUP.exists()
assert len(list((STAGE / 'vendor/mingyun').rglob('*.js'))) == 18
for source in [STAGE / 'mingyun-integration.js', *(STAGE / 'vendor/mingyun').rglob('*.js')]:
    for imported in re.findall(r'(?:import|export)\s+(?:[^;]*?\s+from\s*)?[\'"]([^\'"]+)[\'"]', source.read_text()):
        assert imported.startswith('.') and (source.parent / imported).is_file(), f'Missing pet module: {imported}'
environment_before = digest(BACKEND / '.env')
BACKUP.mkdir(mode=0o700)
for path in EXPECTED:
    shutil.copy2(path, BACKUP / path.name)
rollback_tag = IMAGE + ':before-ui-repair-20260827'
docker('tag', OLD_IMAGE, rollback_tag)
docker('build', '--network=none', '--build-arg', 'BASE_IMAGE=' + rollback_tag,
       '-f', str(STAGE / 'Dockerfile'), '-t', IMAGE, str(STAGE))
for path, expected in EXPECTED.items():
    assert digest(path) == expected, f'{path.name} changed during build'
assert environment_before == digest(BACKEND / '.env')
publish(STAGE / 'main.py', BACKEND / 'moyun_backend/main.py')
publish(STAGE / 'gallery-navigation.js', BACKEND / 'moyun_backend/static/gallery-navigation.js')
docker('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.production.yml',
       'up', '-d', '--no-build', '--no-deps', 'registration')
(SITE / 'vendor').mkdir(exist_ok=True, mode=0o755)
shutil.copytree(STAGE / 'vendor/mingyun', SITE / 'vendor/mingyun')
for path in (SITE / 'vendor').rglob('*'):
    path.chmod(0o755 if path.is_dir() else 0o644)
for name in ('mingyun-integration.js', 'mingyun-integration.css', 'app.js', 'index.html'):
    publish(STAGE / name, SITE / name)
assert environment_before == digest(BACKEND / '.env')
print('UI repair deployed; settings, contest data, bot and timers unchanged.', flush=True)
