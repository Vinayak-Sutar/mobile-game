"""Bump a version's build number when a commit touches its folder.

Run by the git pre-commit hook (install it with `python tools/bump-build.py
--install`). The number lives in <folder>/src/build.js; each version's title
screen compares it with the copy on the server, so the owner can tell at a
glance whether the phone is running what was just pushed.

The hook also runs the offline checkers for the folders that have them, and
refuses the commit if one fails.
"""
import datetime
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Every folder that carries its own build number, and the file it lives in.
GAMES = [('v5', 'Version 5'), ('savi', 'Savi'), ('anime', 'Anime')]
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


# The offline checkers, per folder. Each one exists because something shipped
# broken in a way that only showed up by playing it.
CHECKS = {
    'savi': ('check-level.mjs', 'check-stones.mjs', 'check-music.mjs', 'check-quest.mjs',
             'check-keys.mjs', 'check-menu.mjs', 'check-teach.mjs', 'check-broom.mjs'),
    # Anime's two read the SOURCE as well as running it: a second projection
    # and an off-key colour are both invisible in a render.
    'anime': ('check-view.mjs', 'check-palette.mjs'),
}


def check_level(staged):
    """Refuse a commit that breaks a root.

    Three roots in a row shipped unfinishable, each for a different reason, and
    every one was found by driving the running game for twenty minutes. The
    music shipped wrong for four builds and could only be found by listening.
    These run in about a second between them.
    """
    for folder, names in CHECKS.items():
        if any(p.startswith(folder + '/') for p in staged):
            run_checks(folder, names)


def run_checks(folder, names):
    for name in names:
        script = os.path.join(ROOT, folder, 'tools', name)
        if not os.path.exists(script):
            continue
        # utf-8, explicitly. check-keys prints the arrow keys as arrows, and on a
        # Windows console the default cp1252 decode threw inside subprocess's reader
        # thread - which does not fail the run, so a FAILING check would have gone
        # through with no output and no refusal.
        r = subprocess.run(['node', script], cwd=ROOT, capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        if r.returncode != 0:
            sys.stdout.write(r.stdout or '')
            sys.stdout.write(r.stderr or '')
            print('')
            print('%s failed. Fix it, or commit with --no-verify.' % name)
            sys.exit(1)


def main():
    staged = subprocess.run(['git', 'diff', '--cached', '--name-only'], cwd=ROOT,
                            capture_output=True, text=True, check=True).stdout.split()
    check_level(staged)
    for folder, label in GAMES:
        bump(folder, label, staged)


if __name__ == '__main__':
    install() if '--install' in sys.argv else main()
