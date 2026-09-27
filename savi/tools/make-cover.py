# -*- coding: utf-8 -*-
"""The itch.io cover for Savi.

itch wants 630x500 and shows it as small as 315x250 in a grid of other
people's games, so the whole thing is built to survive being halved: one
silhouette, one bright point, a title a fifth of the height, and no small
text. Everything is drawn at 3x and resampled down, because Pillow has no
antialiasing of its own and a hard-edged banyan at 630 wide looks like a
screenshot of a bug.

TWO THINGS THAT HAD TO BE GOT RIGHT.

Light is SCREENED, never painted. The first go drew the lantern's pool as a
stack of opaque ellipses and it buried the girl it was supposed to light -
she came out as a featureless dome. Glows are drawn on their own black layer
and screened over the picture, which is what light does.

And a banyan is not a tree with a trunk. It is a crown held up by a hundred
aerial roots that have come down and gone woody, so the silhouette is a wide
dark canopy on a braided column with a curtain of thin roots hanging out of
the underside. Drawn as a tapering cylinder with branches it reads as an oak,
or - as the first go did - as a factory chimney.

The palette is the game's own, read off savi-art.js: her shawl is #d8702f and
her skirt #7b4b52 because that is what they are in the sprite.

Run:  python savi/tools/make-cover.py
"""
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'COVER.png')

W, H = 630, 500
S = 3
WW, HH = W * S, H * S

FONTS = r'C:\Windows\Fonts'
TITLE_F = os.path.join(FONTS, 'georgiab.ttf')
SUB_F = os.path.join(FONTS, 'georgia.ttf')

SHAWL = (216, 112, 47)
FRINGE = (239, 183, 106)
SKIRT = (123, 75, 82)
SKIN = (217, 160, 110)
ARM = (192, 138, 90)
HAIR = (42, 28, 24)
THREAD = (201, 79, 109)
BOOT = (58, 43, 34)
LEAF = [(201, 118, 44), (224, 161, 63), (165, 85, 31), (217, 138, 48)]
BARK = (38, 26, 22)
CREAM = (247, 237, 221)

# Where the tree stands and how big it is. Everything else is placed off this.
TX, TY = WW * 0.665, HH * 0.815          # the foot of the trunk
CX, CY = TX - WW * 0.012, HH * 0.300     # the middle of the crown
CRX, CRY = WW * 0.310, HH * 0.150        # how far the crown reaches

rng = random.Random(11)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def blob(cx, cy, rx, ry, wob, seed, n=96):
    """A closed organic outline. Nothing in nature is an ellipse."""
    r = random.Random(seed)
    ph = [r.uniform(0, math.tau) for _ in range(4)]
    pts = []
    for i in range(n):
        a = math.tau * i / n
        k = 1.0 + wob * (0.55 * math.sin(a * 3 + ph[0]) + 0.28 * math.sin(a * 5 + ph[1])
                         + 0.17 * math.sin(a * 8 + ph[2]))
        pts.append((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k))
    return pts


# --- the picture, in layers -------------------------------------------------------

def sky(img):
    d = ImageDraw.Draw(img)
    stops = [(0.00, (20, 25, 52)), (0.30, (52, 38, 70)), (0.52, (110, 58, 62)),
             (0.70, (182, 100, 54)), (0.84, (224, 148, 66)), (1.00, (240, 190, 112))]
    for y in range(HH):
        t = y / (HH - 1)
        for i in range(len(stops) - 1):
            a, b = stops[i], stops[i + 1]
            if a[0] <= t <= b[0]:
                d.line([(0, y), (WW, y)], fill=mix(a[1], b[1], (t - a[0]) / (b[0] - a[0])))
                break


def sunlight():
    """The low sun, as light to be screened on - not as paint."""
    lay = Image.new('RGB', (WW, HH), (0, 0, 0))
    d = ImageDraw.Draw(lay)
    sx, sy = TX + WW * 0.035, HH * 0.585
    for i in range(40, 0, -1):
        k = i / 40.0
        rr = HH * 0.78 * k
        v = int(120 * (1 - k) ** 1.7)
        d.ellipse([sx - rr, sy - rr * 0.85, sx + rr, sy + rr * 0.85],
                  fill=(v, int(v * 0.58), int(v * 0.24)))
    lay = lay.filter(ImageFilter.GaussianBlur(HH * 0.035))
    d = ImageDraw.Draw(lay)
    rr = HH * 0.105
    d.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=(210, 178, 128))
    return lay.filter(ImageFilter.GaussianBlur(S * 3))


def gond_arcs(d):
    """Dotted arcs off the sun: the one unmistakably Gond mark on it."""
    sx, sy = TX + WW * 0.035, HH * 0.585
    for ring in range(7):
        rr = HH * (0.30 + ring * 0.085)
        n = max(6, int(rr * 0.055))
        for i in range(n + 1):
            a = math.pi * (1.03 + 0.94 * i / n)
            x, y = sx + math.cos(a) * rr, sy + math.sin(a) * rr * 0.94
            if not (0 < y < HH * 0.60 and -20 < x < WW + 20):
                continue
            s = S * (0.9 + (ring % 2) * 0.55)
            d.ellipse([x - s, y - s, x + s, y + s], fill=(255, 226, 176))


def hills(d):
    for layer, (base, col) in enumerate([(0.735, (92, 62, 78)), (0.790, (62, 44, 60))]):
        pts = []
        for i in range(0, WW + 1, 6 * S):
            t = i / WW
            y = HH * base - math.sin(t * 4.7 + layer * 2.4) * HH * 0.026 \
                - math.sin(t * 10.9 + layer) * HH * 0.010
            pts.append((i, y))
        pts += [(WW, HH), (0, HH)]
        d.polygon(pts, fill=col)


def ground(d):
    y0 = HH * 0.800
    d.rectangle([0, y0 - S, WW, HH], fill=(56, 42, 36))
    for i in range(260):
        t = rng.random()
        y = y0 + (HH - y0) * (t ** 0.62)
        x = rng.random() * WW
        w = S * (4 + rng.random() * 15) * (0.45 + t)
        h = w * (0.32 + rng.random() * 0.2)
        d.ellipse([x - w, y - h, x + w, y + h],
                  fill=mix((56, 42, 36), LEAF[rng.randrange(4)], 0.26 + t * 0.58))


def banyan(d):
    """A crown, a braided column, and the curtain of roots holding it up."""
    # --- the prop roots, a curtain out of the crown's underside -------------------
    for i in range(34):
        t = i / 33.0
        x = CX + (t - 0.5) * CRX * 1.86
        edge = CY + CRY * math.sqrt(max(0.0, 1 - ((x - CX) / (CRX * 1.02)) ** 2)) * 0.92
        span = 1 - abs(t - 0.5) * 1.55
        if span <= 0.06:
            continue
        # some come all the way down and go woody; some are still hanging
        full = rng.random() < 0.52 + 0.3 * span
        btm = TY - HH * 0.006 if full else edge + HH * rng.uniform(0.06, 0.26)
        wdt = max(1, int(S * (1.0 + 2.9 * span * (1.0 if full else 0.45))))
        wob = WW * rng.uniform(0.004, 0.013)
        ph = rng.uniform(0, math.tau)
        pts = []
        for j in range(19):
            k = j / 18.0
            y = lerp(edge, btm, k)
            xx = x + wob * math.sin(k * 3.4 + ph) * (1 - k * 0.45)
            if full:
                xx += (x - CX) * 0.055 * k * k          # they splay as they land
            pts.append((xx, y))
        d.line(pts, fill=BARK, width=wdt, joint='curve')
        if full:
            fw = wdt * 1.9
            d.polygon([(pts[-1][0] - fw, TY), (pts[-1][0] + fw, TY),
                       (pts[-1][0] + fw * 0.35, TY - HH * 0.035),
                       (pts[-1][0] - fw * 0.35, TY - HH * 0.035)], fill=BARK)

    # --- the column: one fused mass, fluted, not a cylinder -----------------------
    top = CY + CRY * 0.55
    left, right = [], []
    for j in range(31):
        k = j / 30.0
        y = lerp(TY, top, k)
        w = WW * 0.062 * (1.0 + 1.15 * (1 - k) ** 2.6) * (1 - 0.34 * k)
        flute = WW * 0.011 * math.sin(k * 9.0) * (1 - k * 0.4)
        left.append((TX - w + flute, y))
        right.append((TX + w - flute * 0.7, y))
    d.polygon(left + right[::-1], fill=BARK)
    # the buttress where it meets the ground
    d.polygon([(TX - WW * 0.135, TY + HH * 0.012), (TX - WW * 0.055, TY - HH * 0.085),
               (TX + WW * 0.055, TY - HH * 0.085), (TX + WW * 0.135, TY + HH * 0.012)], fill=BARK)

    # --- the crown ------------------------------------------------------------------
    d.polygon(blob(CX, CY, CRX, CRY, 0.115, 3), fill=(30, 22, 21))
    for i in range(48):                      # clustered masses, so it is not one lump
        a = rng.uniform(0, math.tau)
        rr = rng.random() ** 0.5
        bx = CX + math.cos(a) * CRX * 0.94 * rr
        by = CY + math.sin(a) * CRY * 0.92 * rr
        br = WW * (0.026 + 0.030 * (1 - rr))
        up = max(0.0, min(1.0, 1 - (by - (CY - CRY)) / (CRY * 2)))
        lit = max(0.0, min(1.0, 1 - abs(bx - (TX + WW * 0.035)) / (CRX * 1.5)))
        d.polygon(blob(bx, by, br, br * 0.72, 0.16, 100 + i),
                  fill=mix((40, 28, 24), LEAF[rng.randrange(4)], 0.26 + 0.44 * up + 0.22 * lit))
    for i in range(300):                     # and the gold scattered through it
        a = rng.uniform(0, math.tau)
        rr = rng.random() ** 0.6
        bx = CX + math.cos(a) * CRX * 0.92 * rr
        by = CY + math.sin(a) * CRY * 0.88 * rr
        sz = S * rng.uniform(0.9, 2.6)
        d.ellipse([bx - sz, by - sz * 0.8, bx + sz, by + sz * 0.8],
                  fill=mix(LEAF[rng.randrange(4)], (255, 214, 140), rng.random() * 0.45))
    for i in range(420):                     # the gold the sun catches on the rim
        a = rng.uniform(0, math.tau)
        rr = 0.80 + rng.random() * 0.30
        bx = CX + math.cos(a) * CRX * rr
        by = CY + math.sin(a) * CRY * rr
        if (bx - CX) ** 2 / (CRX * 1.16) ** 2 + (by - CY) ** 2 / (CRY * 1.16) ** 2 > 1:
            continue
        s = S * rng.uniform(0.8, 2.2)
        d.ellipse([bx - s, by - s, bx + s, by + s], fill=LEAF[rng.randrange(4)])

    # --- the threads the women tie round it -----------------------------------------
    for i in range(3):
        y = TY - HH * (0.062 + i * 0.030)
        w = WW * 0.062 * (1.0 + 1.15 * (1 - (TY - y) / (TY - top)) ** 2.6)
        d.arc([TX - w * 0.95, y - HH * 0.008, TX + w * 0.95, y + HH * 0.008],
              0, 180, fill=mix(THREAD, (246, 214, 172), 0.45 + i * 0.18), width=int(S * 0.9))


def savi(d, cx, cy, k, face=1):
    """Her, at cover size.

    NOT the sprite blown up. The sprite is a top-down doll about thirty-two
    units tall with a head a fifth of that, which is right at forty pixels
    across a valley and turns into a mushroom at a hundred and twenty. Blown
    up, its hair cap swallows the face and the eyes sit off to one side.

    So she is rebuilt on the same palette and the same reading - the orange
    shawl, the rose skirt, the braid with its thread, the broom, the lantern -
    with proportions that hold at this size: a little taller, legs and boots
    that show under the hem, a face that is mostly face, and the broom slung
    behind her with the twigs up over her shoulder so they stay out of her
    skirt.

    `face` is +1 or -1. She stands left of the tree and looks at it, so the
    lantern goes on the side nearest it and its light falls between the two of
    them, which is what ties the picture together.
    """
    def P(x, y):
        return (cx + x * face * k, cy + y * k)

    def poly(pts, col):
        d.polygon([P(*q) for q in pts], fill=col)

    def ell(x, y, rx, ry, col):
        d.ellipse([P(x - rx, y - ry), P(x + rx, y + ry)], fill=col)

    def wide(w):
        return int(max(1, round(w * k)))

    EDGE = (33, 22, 20)

    # SHE IS STANDING ON GROUND SHE HAS SWEPT. It is the verb of the game, it
    # explains the broom, and it lifts her off a field of gold she would
    # otherwise be knee deep in.
    d.ellipse([P(-26, -6), P(26, 8)], fill=(78, 56, 43))
    d.ellipse([P(-21, -4.6), P(21, 6.4)], fill=(96, 70, 51))
    ell(0.5, 2.6, 11, 3.6, (46, 34, 29))                     # her shadow

    # THE BROOM, slung behind her: one long diagonal with the twigs up over
    # her shoulder. It is the first thing the silhouette says about her.
    d.line([P(9.5, -36.0), P(-2.0, -2.0)], fill=EDGE, width=wide(2.9))
    d.line([P(9.5, -36.0), P(-2.0, -2.0)], fill=(118, 82, 48), width=wide(1.9))
    for m in range(-4, 5):
        d.line([P(9.2 + m * 0.3, -34.0), P(9.8 + m * 1.5, -43.0 + abs(m) * 0.7)],
               fill=(198, 158, 92), width=wide(1.0))
    d.line([P(8.0, -32.4), P(10.9, -33.4)], fill=(136, 94, 52), width=wide(1.5))

    # legs and boots, under the hem
    for lx in (-3.4, 3.4):
        d.line([P(lx, -9.5), P(lx, -3.2)], fill=(176, 126, 84), width=wide(3.0))
        ell(lx, -1.6, 3.4, 2.4, BOOT)

    # the skirt
    poly([(-6.0, -19.5), (-9.0, -12), (-8.6, -8.5), (8.6, -8.5), (9.0, -12), (6.0, -19.5)], EDGE)
    poly([(-5.4, -19.0), (-8.2, -12), (-7.8, -9.2), (7.8, -9.2), (8.2, -12), (5.4, -19.0)], SKIRT)
    poly([(1.0, -19.0), (5.4, -19.0), (8.2, -12), (7.8, -9.2), (1.0, -9.2)],
         mix(SKIRT, (0, 0, 0), 0.20))

    # THE SHAWL, the one bright thing out here
    poly([(-8.6, -28.6), (-10.4, -22.5), (-8.2, -18.2), (8.2, -18.2), (10.4, -22.5),
          (8.6, -28.6), (0, -30.6)], EDGE)
    poly([(-8.0, -28.4), (-9.6, -22.5), (-7.6, -18.8), (7.6, -18.8), (9.6, -22.5),
          (8.0, -28.4), (0, -30.2)], SHAWL)
    poly([(0, -30.2), (8.0, -28.4), (9.6, -22.5), (7.6, -18.8), (0, -18.8)],
         mix(SHAWL, (0, 0, 0), 0.17))
    for m in range(-2, 3):                                   # its fringe
        d.line([P(m * 2.9, -18.8), P(m * 2.9, -17.2)], fill=FRINGE, width=wide(0.7))

    # THE BRAID, over the shawl and not behind it. Drawn first it disappeared
    # under her shoulder and all that showed was the thread at the end of it,
    # a pink dot on her hip with nothing attached to it.
    d.line([P(-3.2, -33.4), P(-7.6, -27.5), P(-8.8, -20.5)], fill=HAIR, width=wide(3.2), joint='curve')
    ell(-8.8, -20.5, 1.7, 1.7, THREAD)

    # the arm, out toward the tree, carrying the lantern
    d.line([P(6.2, -26.0), P(10.4, -23.0), P(12.2, -19.6)], fill=EDGE, width=wide(3.4), joint='curve')
    d.line([P(6.2, -26.0), P(10.4, -23.0), P(12.2, -19.6)], fill=ARM, width=wide(2.4), joint='curve')

    # HEAD. The hair is a cap over the crown and down past the ears; the face
    # is the rest of it and is most of it. A full dark circle behind a smaller
    # face leaves a ring of dark under her chin that reads as a beard, which
    # is how the sprite learned it.
    ell(0.4, -35.4, 7.0, 7.4, EDGE)
    ell(0.4, -35.4, 6.4, 6.8, SKIN)
    d.pieslice([P(0.4 - 6.6, -35.4 - 7.0), P(0.4 + 6.6, -35.4 + 7.0)], 182, 358, fill=HAIR)
    poly([(-6.6, -35.0), (-6.9, -31.6), (-5.2, -32.6), (-4.6, -35.2)], HAIR)   # past the ear
    poly([(6.6, -35.0), (6.9, -31.6), (5.2, -32.6), (4.6, -35.2)], HAIR)
    ell(0.4, -41.0, 3.0, 1.4, HAIR)                          # the crown of it
    ell(-1.8, -34.6, 0.95, 1.25, (28, 18, 16))               # eyes
    ell(2.8, -34.6, 0.95, 1.25, (28, 18, 16))
    ell(0.5, -31.6, 1.3, 0.7, mix(SKIN, (152, 72, 62), 0.55))

    # THE LANTERN: a brass bowl on a wire hoop, with the coal sitting in it
    lx, ly = 13.2, -17.6
    d.line([P(lx, ly - 5.6), P(lx - 2.4, ly - 1.7)], fill=(164, 138, 102), width=wide(1.1))
    d.line([P(lx, ly - 5.6), P(lx + 2.4, ly - 1.7)], fill=(164, 138, 102), width=wide(1.1))
    poly([(lx - 3.0, ly - 1.9), (lx + 3.0, ly - 1.9), (lx + 2.2, ly + 2.8), (lx - 2.2, ly + 2.8)],
         (52, 42, 35))
    poly([(lx - 2.4, ly - 1.4), (lx + 2.4, ly - 1.4), (lx + 1.8, ly + 2.2), (lx - 1.8, ly + 2.2)],
         (96, 74, 52))
    ell(lx, ly + 0.4, 1.7, 1.9, (255, 216, 142))
    return P(lx, ly + 0.4)


def lantern_light(at, k):
    """Her lamp, as light: a pool on the ground and a bloom at the coal."""
    lay = Image.new('RGB', (WW, HH), (0, 0, 0))
    d = ImageDraw.Draw(lay)
    lx, ly = at
    gy = ly + 9.0 * k
    for i in range(30, 0, -1):
        t = i / 30.0
        rx, ry = 30 * k * t, 9.5 * k * t
        v = int(116 * (1 - t) ** 1.5)
        d.ellipse([lx - rx, gy - ry, lx + rx, gy + ry], fill=(v, int(v * 0.60), int(v * 0.26)))
    for i in range(26, 0, -1):
        t = i / 26.0
        rr = 13 * k * t
        v = int(210 * (1 - t) ** 1.25)
        d.ellipse([lx - rr, ly - rr, lx + rr, ly + rr], fill=(v, int(v * 0.72), int(v * 0.38)))
    return lay.filter(ImageFilter.GaussianBlur(S * 2.2))


def title(img):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(TITLE_F, int(118 * S))
    fs = ImageFont.truetype(SUB_F, int(19 * S))
    x, y = int(44 * S), int(46 * S)
    b = d.textbbox((x, y), 'SAVI', font=f)

    # A soft dark wash behind it, so cream letters hold over a bright sky
    # without a box being drawn round them.
    sh = Image.new('L', (WW, HH), 0)
    ImageDraw.Draw(sh).text((x, y), 'SAVI', font=f, fill=200)
    ImageDraw.Draw(sh).rectangle([x, b[3] + 4 * S, b[2], b[3] + 50 * S], fill=120)
    sh = sh.filter(ImageFilter.GaussianBlur(20 * S))
    img.paste(Image.new('RGB', (WW, HH), (20, 12, 16)), (0, 0), sh)

    d.text((x + 3 * S, y + 4 * S), 'SAVI', font=f, fill=(24, 13, 12))
    d.text((x, y), 'SAVI', font=f, fill=CREAM)
    ly = b[3] + int(4 * S)
    d.line([(x + 3 * S, ly), (b[2] - 3 * S, ly)], fill=(230, 166, 96), width=int(2.2 * S))
    d.text((x + 4 * S, ly + int(9 * S)), 'keeper of the Great Banyan', font=fs, fill=(243, 212, 168))


def main():
    img = Image.new('RGB', (WW, HH), (20, 25, 52))
    sky(img)
    img = ImageChops.screen(img, sunlight())
    d = ImageDraw.Draw(img)
    gond_arcs(d)
    hills(d)
    ground(d)
    banyan(d)

    sx, sy, sk = WW * 0.215, HH * 0.880, S * 2.35
    at = savi(d, sx, sy, sk)
    img = ImageChops.screen(img, lantern_light(at, sk))

    vig = Image.new('L', (WW, HH), 0)
    ImageDraw.Draw(vig).ellipse([-WW * 0.26, -HH * 0.34, WW * 1.26, HH * 1.34], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(WW * 0.11)).point(lambda v: int((255 - v) * 0.55))
    img.paste(Image.new('RGB', (WW, HH), (16, 9, 15)), (0, 0), vig)

    title(img)

    out = img.resize((W, H), Image.LANCZOS)
    out.save(OUT)
    out.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(ROOT, 'COVER-thumb.png'))
    print('%s  %dx%d  %.0f KB' % (OUT, out.width, out.height, os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
