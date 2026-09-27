# -*- coding: utf-8 -*-
"""Take the hand-drawn art in, and put the whole of ASSETS into WebP.

TWO JOBS.

The hand-drawn files arrived with names that are nearly right: "keeper-hopeful
.png", "savitri-clever. .png", "yama-respect .png". A trailing space is
invisible in Explorer and fatal on a web server, which is case- and
space-sensitive and would simply 404. So every source file is matched to the
one name the game asks for, and the source files are tidied up in place as
well, so the next drop is a straight copy.

And the art is the entire payload - the code is 400 KB and the pictures were
24 MB. WebP at 82 is the same picture at a quarter of the size, which matters
on itch and matters more on the owner's phone over Pages.

ANYTHING THE HAND-DRAWN FOLDER HAS, WINS. Whatever is not in there yet keeps
the picture that is already in ASSETS, untouched - not re-encoded, because
re-encoding a WebP from a WebP loses a little more every time it happens.

Run:  python savi/tools/convert-art.py
"""
import io
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SAVI = os.path.dirname(HERE)
ART = os.path.join(SAVI, 'ASSETS')
HAND = os.path.join(ART, 'Hand-drawn assets')

# A portrait is drawn into a 220x300 box, or 880x470 for a mural. Twice that
# is as much as any screen can use; past it the bytes buy nothing.
CAP_PORTRAIT = 1100
CAP_MURAL = 1800
QUALITY = 82


def wanted():
    """The names the game asks for, read off savi-assets.js so they cannot drift."""
    src = io.open(os.path.join(SAVI, 'src', 'savi-assets.js'), encoding='utf-8').read()
    out = {}
    for key in ('PORTRAITS', 'MURALS'):
        m = re.search(r'export const %s = \[(.*?)\];' % key, src, re.S)
        out[key] = re.findall(r"'([^']+)'", m.group(1))
    return out['PORTRAITS'], out['MURALS']


def canon(filename):
    """The name a file was MEANT to have: no spaces, no stray dots, no extension."""
    stem = os.path.splitext(filename)[0]
    return re.sub(r'[^a-z0-9-]', '', stem.lower().replace(' ', '').replace('.', ''))


def save(img, path, cap):
    if max(img.size) > cap:
        k = cap / float(max(img.size))
        img = img.resize((max(1, int(img.width * k)), max(1, int(img.height * k))), Image.LANCZOS)
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGBA' if 'A' in img.mode or img.mode == 'P' else 'RGB')
    img.save(path, 'WEBP', quality=QUALITY, method=6)


def main():
    portraits, murals = wanted()
    kb = lambda p: os.path.getsize(p) / 1024.0

    # --- what is in the hand-drawn folder, by the name it was meant to have ------
    hand = {}
    clashes = []
    for f in sorted(os.listdir(HAND)):
        if not os.path.isfile(os.path.join(HAND, f)):
            continue
        c = canon(f)
        if c in hand:
            clashes.append(c)
        hand[c] = f
    if clashes:
        print('TWO FILES WANT THE SAME NAME: %s' % ', '.join(clashes))
        sys.exit(1)

    print('the hand-drawn folder holds %d files\n' % len(hand))

    # --- the names, checked ------------------------------------------------------
    renamed, missing, extra = [], [], []
    for f in sorted(os.listdir(HAND)):
        if not os.path.isfile(os.path.join(HAND, f)):
            continue
        c = canon(f)
        right = c + os.path.splitext(f)[1].lower()
        if f != right and c in portraits + murals:
            os.replace(os.path.join(HAND, f), os.path.join(HAND, right))
            renamed.append('%s  ->  %s' % (f, right))
    if renamed:
        print('names tidied (a trailing space is invisible here and a 404 on a server):')
        for r in renamed:
            print('   ' + r)
        print('')

    for n in portraits:
        if n not in hand:
            missing.append(n)
    for c in hand:
        if c not in portraits + murals:
            extra.append(hand[c])

    # --- convert ------------------------------------------------------------------
    before = sum(kb(os.path.join(ART, f)) for f in os.listdir(ART)
                 if os.path.isfile(os.path.join(ART, f)))
    done, kept = [], []

    for n, cap in [(q, CAP_PORTRAIT) for q in portraits] + [(q, CAP_MURAL) for q in murals]:
        out = os.path.join(ART, n + '.webp')
        if n in hand:
            src = os.path.join(HAND, canon(hand[n]) + os.path.splitext(hand[n])[1].lower())
            if not os.path.exists(src):
                src = os.path.join(HAND, hand[n])
            save(Image.open(src), out, cap)
            done.append(n)
        elif os.path.exists(out):
            # nothing new for it: leave what is there alone rather than put a
            # WebP through WebP again for nothing
            kept.append(n)
        else:
            old = os.path.join(ART, n + '.png')
            if not os.path.exists(old):
                print('NOTHING AT ALL for %s - it will 404' % n)
                sys.exit(1)
            save(Image.open(old), out, cap)
            kept.append(n)

    # --- the old PNGs go ------------------------------------------------------------
    gone = 0
    for f in sorted(os.listdir(ART)):
        p = os.path.join(ART, f)
        if os.path.isfile(p) and f.lower().endswith(('.png', '.jpg', '.jpeg')):
            os.remove(p)
            gone += 1

    after = sum(kb(os.path.join(ART, f)) for f in os.listdir(ART)
                if os.path.isfile(os.path.join(ART, f)))

    print('hand-drawn, now in place  %2d  %s' % (len(done), ', '.join(done)))
    print('left as they were         %2d  %s' % (len(kept), ', '.join(kept) or '-'))
    if missing:
        print('STILL TO COME             %2d  %s  (the old art is standing in)'
              % (len(missing), ', '.join(missing)))
    if extra:
        print('in the folder, unused     %2d  %s' % (len(extra), ', '.join(sorted(extra))))
    print('')
    print('%d old files removed' % gone)
    print('ASSETS  %.1f MB  ->  %.1f MB' % (before / 1024.0, after / 1024.0))


if __name__ == '__main__':
    main()
