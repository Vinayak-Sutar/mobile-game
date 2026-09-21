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
BUILD_JS = os.path.join(ROOT, 'v5', 'src', 'build.js')
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


def main():
    staged = subprocess.run(['git', 'diff', '--cached', '--name-only'], cwd=ROOT,
                            capture_output=True, text=True, check=True).stdout.split()
    if not any(p.startswith('v5/') and p != 'v5/src/build.js' for p in staged):
        return
    src = io.open(BUILD_JS, encoding='utf-8').read()
    n = int(re.search(r'BUILD\s*=\s*(\d+)', src).group(1)) + 1
    when = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    src = re.sub(r'BUILD\s*=\s*\d+', 'BUILD = %d' % n, src)
    src = re.sub(r"BUILT\s*=\s*'[^']*'", "BUILT = '%s'" % when, src)
    io.open(BUILD_JS, 'w', encoding='utf-8', newline='\n').write(src)
    subprocess.run(['git', 'add', 'v5/src/build.js'], cwd=ROOT, check=True)
    print('Version 5 build %d' % n)


if __name__ == '__main__':
    install() if '--install' in sys.argv else main()
