# -*- coding: utf-8 -*-
"""Build the zip that goes to itch.io, and the bundle that makes file:// work.

WHAT ITCH WANTS. An HTML5 upload is a zip with `index.html` AT THE ROOT of the
zip - not inside a folder in the zip. That is the one rule people trip over,
because right-clicking a folder on Windows and choosing "Compress" puts the
folder INSIDE the zip and itch then says it cannot find an index file. So this
writes the zip itself, with the paths already right, and there is nothing to
get wrong at upload time.

The other limits - 1000 files extracted, 500 MB total, 200 MB per file,
relative paths only - we are nowhere near.

WHAT GOES IN. Not the whole savi folder. Of the 108 files in src/ only about
thirty are reachable from savi.js; the rest is inherited engine that would
ship for nothing. So the reachable graph is bundled into one script and the
import graph disappears. The tools, the writing notes, the cover and the art
review page do not go either.

Being one plain script rather than a hundred modules is also what makes the
same folder run from a file:// URL, where a module cannot be fetched at all.

Run:  python savi/tools/pack-itch.py
"""
import io
import os
import re
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SAVI = os.path.dirname(HERE)
ROOT = os.path.dirname(SAVI)
DIST = os.path.join(ROOT, 'dist')
OUTD = os.path.join(DIST, 'savi-itch')
ZIP = os.path.join(DIST, 'savi-itch.zip')
BUNDLE = os.path.join(SAVI, 'savi.bundle.js')


def assets_wanted():
    """Only the art the game actually names.

    ASSETS also holds a reference sheet the game never loads, and it is the
    single biggest file in there.
    """
    src = io.open(os.path.join(SAVI, 'src', 'savi-assets.js'), encoding='utf-8').read()
    names = []
    for key in ('PORTRAITS', 'MURALS'):
        m = re.search(r'export const %s = \[(.*?)\];' % key, src, re.S)
        if not m:
            print('cannot find %s in savi-assets.js' % key)
            sys.exit(1)
        names += re.findall(r"'([^']+)'", m.group(1))
    return names


def bundle():
    """One script, from the reachable graph, with no import graph left at runtime."""
    cmd = ['npx', '--yes', 'esbuild', os.path.join(SAVI, 'src', 'savi.js'),
           '--bundle', '--format=iife', '--outfile=' + BUNDLE]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', shell=(os.name == 'nt'))
    if r.returncode != 0:
        sys.stdout.write(r.stdout or '')
        sys.stdout.write(r.stderr or '')
        print('\nesbuild failed.')
        sys.exit(1)
    return os.path.getsize(BUNDLE)


def page():
    """index.html for the upload: the bundle, and none of the dev furniture.

    The loader in the source page picks modules or the bundle by protocol,
    which is what it needs to do while it is being worked on. The shipped page
    has no src/ to pick, so it just loads the bundle.
    """
    html = io.open(os.path.join(SAVI, 'index.html'), encoding='utf-8').read()
    i = html.index('  <script>\n    /* HOW THE GAME IS LOADED')
    j = html.index('</script>', i) + len('</script>')
    html = html[:i] + '  <script src="./savi.bundle.js"></script>' + html[j:]
    # the build number and its REFETCH button are how the owner tells whether
    # his phone has the latest push; a player has nothing to compare it to
    html = re.sub(r'\s*<div id="ver" class="ver"></div>', '', html)
    return html


def main():
    names = assets_wanted()
    size = bundle()

    if os.path.isdir(OUTD):
        shutil.rmtree(OUTD)
    os.makedirs(os.path.join(OUTD, 'ASSETS'))

    io.open(os.path.join(OUTD, 'index.html'), 'w', encoding='utf-8', newline='\n').write(page())
    shutil.copy2(BUNDLE, os.path.join(OUTD, 'savi.bundle.js'))

    missing = []
    for n in names:
        src = os.path.join(SAVI, 'ASSETS', n + '.png')
        if not os.path.exists(src):
            missing.append(n)
            continue
        shutil.copy2(src, os.path.join(OUTD, 'ASSETS', n + '.png'))
    if missing:
        print('MISSING art the game asks for: %s' % ', '.join(missing))
        sys.exit(1)

    # --- the zip, with index.html at the ROOT of it -------------------------------
    if os.path.exists(ZIP):
        os.remove(ZIP)
    files = 0
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, _dirs, fs in os.walk(OUTD):
            for f in sorted(fs):
                full = os.path.join(base, f)
                # forward slashes, always: a zip made with backslashes unpacks
                # as one file with a slash in its name on a Linux server
                arc = os.path.relpath(full, OUTD).replace(os.sep, '/')
                z.write(full, arc)
                files += 1

    with zipfile.ZipFile(ZIP) as z:
        names_in = z.namelist()
    assert 'index.html' in names_in, 'index.html is not at the root of the zip'

    mb = os.path.getsize(ZIP) / 1048576.0
    print('bundle      %s  (%.0f KB)' % (os.path.relpath(BUNDLE, ROOT), size / 1024.0))
    print('folder      %s' % os.path.relpath(OUTD, ROOT))
    print('zip         %s  (%.1f MB, %d files)' % (os.path.relpath(ZIP, ROOT), mb, files))
    print('')
    print('index.html is at the root of the zip: yes')
    print('files %d of 1000, size %.1f of 500 MB' % (files, mb))
    print('')
    print('Upload dist/savi-itch.zip to itch. See savi/SUBMITTING.md.')


if __name__ == '__main__':
    main()
