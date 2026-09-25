"""Bump Version 5's build number when a commit touches v5/.

Run by the git pre-commit hook (install it with `python tools/bump-build.py
--install`). The number lives in v5/src/build.js; the game's title screen
compares it with the copy on the server, so the owner can tell at a glance
whether the phone is running what was just pushed.
"""
import datetime
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Every folder that carries its own build number, and the file it lives in.
GAMES = [('v5', 'Version 5'), ('savi', 'Savi')]
HOOK = os.path.join(ROOT, '.git', 'hooks', 'pre-commit')


def install():
    with io.open(HOOK, 'w', encoding='utf-8', newline='\n') as f:
        f.write('#!/bin/sh\n# Bumps v5/src/build.js (see tools/bump-build.py).\n'
                'python tools/bump-build.py || python3 tools/bump-build.py\n')
    try:
        os.chmod(HOOK, 0o755)
    except OSError:
        pass
    print('pre-commit hook installed')


def bump(folder, label, staged):
    rel = '%s/src/build.js' % folder
    if not any(p.startswith(folder + '/') and p != rel for p in staged):
        return
    path = os.path.join(ROOT, folder, 'src', 'build.js')
    src = io.open(path, encoding='utf-8').read()
    n = int(re.search(r'BUILD\s*=\s*(\d+)', src).group(1)) + 1
    when = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    src = re.sub(r'BUILD\s*=\s*\d+', 'BUILD = %d' % n, src)
    src = re.sub(r"BUILT\s*=\s*'[^']*'", "BUILT = '%s'" % when, src)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(src)
    subprocess.run(['git', 'add', rel], cwd=ROOT, check=True)
    print('%s build %d' % (label, n))


def main():
    staged = subprocess.run(['git', 'diff', '--cached', '--name-only'], cwd=ROOT,
                            capture_output=True, text=True, check=True).stdout.split()
    for folder, label in GAMES:
        bump(folder, label, staged)


if __name__ == '__main__':
    install() if '--install' in sys.argv else main()
