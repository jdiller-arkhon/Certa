#!/usr/bin/env python3
"""
Builds the Certa and Argus logo families (SVG) from geometry. Reproducible.

    pip install fonttools shapely
    GEIST_SEMIBOLD=.../Geist-SemiBold.ttf GEIST_MEDIUM=.../Geist-Medium.ttf python3 brand/build.py
    node brand/render.mjs        # PNG exports

System (brand/README.md): every Arkhon product mark is the solid Arkhon triangle, cut by
channels of one width into facets. The channels draw the product's idea in negative space:
  Certa — a check (the verified record).
  Argus — three paths meeting at a hub (the platform every job runs through).
Wordmarks are Geist SemiBold, outlined, so the files need no fonts.
"""
import math
import os
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from shapely.geometry import LineString, Point, Polygon

OUT = Path(__file__).parent
INK, TILE, MUTED, WHITE, MUTED_DARK = '#1d1d1f', '#2b2b2e', '#5f6168', '#ffffff', '#b3b3bc'

# ------------------------------------------------------------------ geometry (64-unit grid)

TRIANGLE = Polygon([(32, 5), (60, 55), (4, 55)])
CENTROID = (32, 115 / 3)
CHANNEL = 4.2      # channel width at display sizes
CHANNEL_SMALL = 6  # wider channels for the ≤32 px variant so the cuts survive pixelation
CORNER = 0.9       # corner rounding

def ray(p, ang_deg, length=90):
    a = math.radians(ang_deg)
    return (p[0] + math.cos(a) * length, p[1] - math.sin(a) * length)

def channel(points, w):
    return LineString(points).buffer(w / 2, cap_style='flat', join_style='mitre', mitre_limit=6)

def rounded(g, r):
    return g.buffer(-r, join_style='round').buffer(r, join_style='round')

def certa(w=CHANNEL):
    """Check-shaped channel: 45° short arm into a low vertex, 58° long arm out the right edge."""
    v = (26.5, 50.5)
    return rounded(TRIANGLE.difference(channel([ray(v, 135), v, ray(v, 58)], w)), CORNER)

def argus(w=CHANNEL):
    """Three channels from the vertices meet at a hub at the centroid."""
    c = CENTROID
    cut = channel([c, (32, -30)], w).union(channel([c, ray(c, 210)], w)).union(channel([c, ray(c, -30)], w))
    cut = cut.union(Point(c).buffer(w, 96))
    return rounded(TRIANGLE.difference(cut), CORNER)

PRODUCTS = {
    'certa': {'name': 'Certa', 'mark': certa},
    'argus': {'name': 'Argus', 'mark': argus},
}

def d_of(geom):
    polys = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
    out = []
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            out.append('M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in c) + ' Z')
    return ' '.join(out)

# Optical box: the triangle sits slightly low in a square so it looks centered.
VIEWBOX = (0, -3.6, 64, 64)

# ------------------------------------------------------------------ type

class Outliner:
    def __init__(self, ttf):
        self.font = TTFont(ttf)
        self.gs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.upm = self.font['head'].unitsPerEm
        os2 = self.font['OS/2']
        self.cap = os2.sCapHeight
        self.xh = os2.sxHeight

    def text(self, s, size, tracking_em=0.0):
        scale = size / self.upm
        pen = SVGPathPen(self.gs)
        x = 0.0
        for i, ch in enumerate(s):
            g = self.gs[self.cmap[ord(ch)]]
            g.draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
            x += g.width * scale + (tracking_em * size if i < len(s) - 1 else 0)
        return pen.getCommands(), x

# ------------------------------------------------------------------ output

def svg(w, h, body, title, vb=None):
    vb = vb or f'0 0 {w:.2f} {h:.2f}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')

def mark_g(d, fill, size, x, y):
    k = size / VIEWBOX[2]
    return f'<path fill="{fill}" fill-rule="evenodd" transform="translate({x:.2f} {y:.2f}) scale({k:.5f}) translate({-VIEWBOX[0]} {-VIEWBOX[1]})" d="{d}"/>'

def build(semibold, medium):
    sb, md = Outliner(semibold), Outliner(medium)
    vb = ' '.join(str(v) for v in VIEWBOX)
    for product, meta in PRODUCTS.items():
        out = OUT / product
        out.mkdir(exist_ok=True)
        for old in out.glob('*.svg'):
            old.unlink()
        name = meta['name']
        d = d_of(meta['mark']())
        d_small = d_of(meta['mark'](CHANNEL_SMALL))

        # Marks
        for variant, fill in [('', INK), ('-white', WHITE)]:
            (out / f'{product}-mark{variant}.svg').write_text(svg(64, 64, f'<path fill="{fill}" fill-rule="evenodd" d="{d}"/>', name, vb))
            (out / f'{product}-mark-small{variant}.svg').write_text(svg(64, 64, f'<path fill="{fill}" fill-rule="evenodd" d="{d_small}"/>', name, vb))

        # App icons (tile corner baked in; maskable is full-bleed with a safe-zone mark)
        S = 1024
        for suffix, rx, frac, md_ in [('', 0.225 * S, 0.62, d), ('-maskable', 0, 0.5, d), ('-small', 0.225 * S, 0.66, d_small)]:
            size = frac * S
            body = f'<rect width="{S}" height="{S}" rx="{rx:.0f}" fill="{TILE}"/>' + mark_g(md_, WHITE, size, (S - size) / 2, (S - size) / 2)
            (out / f'{product}-app-icon{suffix}.svg').write_text(svg(S, S, body, name))

        # Wordmark: Geist SemiBold, sentence case, tightened like the app's headlines.
        H = 64                                  # lockup height = mark height
        size = 40                               # cap height ≈ 0.45 × mark
        word_d, word_w = sb.text(name, size, tracking_em=-0.025)
        cap = sb.cap * size / sb.upm
        gap = 0.3 * H
        # Align the wordmark's cap height with the triangle's visual middle band.
        base = H / 2 + cap / 2 + 3
        for variant, fg in [('', INK), ('-white', WHITE)]:
            body = mark_g(d, fg, H, 0, 0) + f'<path fill="{fg}" transform="translate({H + gap:.2f} {base:.2f})" d="{word_d}"/>'
            (out / f'{product}-lockup{variant}.svg').write_text(svg(H + gap + word_w + 1, H, body, f'{name} by Arkhon Industries'))

        # Lockup with endorsement line: "by Arkhon Industries"
        sub_size = 12.5
        sub_d, sub_w = md.text('by Arkhon Industries', sub_size, tracking_em=0.0)
        sub_cap = md.xh * sub_size / md.upm
        line_gap = 8
        block = cap + line_gap + sub_cap
        top = H / 2 - block / 2 + 3
        for variant, fg, sub in [('', INK, MUTED), ('-white', WHITE, MUTED_DARK)]:
            body = (mark_g(d, fg, H, 0, 0)
                    + f'<path fill="{fg}" transform="translate({H + gap:.2f} {top + cap:.2f})" d="{word_d}"/>'
                    + f'<path fill="{sub}" transform="translate({H + gap + 1:.2f} {top + cap + line_gap + sub_cap + 2:.2f})" d="{sub_d}"/>')
            (out / f'{product}-lockup-endorsed{variant}.svg').write_text(svg(H + gap + max(word_w, sub_w) + 1, H, body, f'{name} by Arkhon Industries'))

        (out / f'{product}-wordmark.svg').write_text(svg(word_w + 2, cap + 2, f'<path fill="{INK}" transform="translate(1 {cap + 1:.2f})" d="{word_d}"/>', name))

    ts = ['// GENERATED by brand/build.py — do not edit. Product marks (fill-rule evenodd).',
          f'export const MARK_VIEWBOX = "{vb}";']
    for product, meta in PRODUCTS.items():
        word_d, word_w = sb.text(meta['name'], 40, tracking_em=-0.025)
        cap = sb.cap * 40 / sb.upm
        ts.append(f'/** {meta["name"]} wordmark outlines (Geist SemiBold); baseline at y=0, cap height {cap:.2f}. */')
        ts.append(f'export const {product.upper()}_WORDMARK = {{ d: "{word_d}", width: {word_w:.2f}, capHeight: {cap:.2f} }} as const;')
        ts.append(f'export const {product.upper()}_MARK = "{d_of(meta["mark"]())}";')
        ts.append(f'export const {product.upper()}_MARK_SMALL = "{d_of(meta["mark"](CHANNEL_SMALL))}";')
    (OUT.parent / 'apps' / 'web' / 'src' / 'components' / 'brand-marks.ts').write_text('\n'.join(ts) + '\n')
    print('built', ', '.join(PRODUCTS))

if __name__ == '__main__':
    build(os.environ['GEIST_SEMIBOLD'], os.environ['GEIST_MEDIUM'])
