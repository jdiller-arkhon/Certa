#!/usr/bin/env python3
"""
Builds the Certa and Argus logo families (SVG). Reproducible: run after changing geometry.

    GEIST_SEMIBOLD=/path/Geist-SemiBold.ttf GEIST_MEDIUM=/path/Geist-Medium.ttf python3 brand/build.py

Geist (SIL Open Font License) is from the `geist` npm package. Wordmarks are converted to
outlines, so the output SVGs need no fonts. PNGs are rendered from these SVGs separately
(brand/render.mjs).

Family system (see brand/README.md): every Arkhon product mark is the same "lens" — the Arkhon
split peak over a horizon bowl — with one product glyph at its center:
  Argus = pupil (the platform that sees every job), Certa = check (the verified record).
"""
import math
import os
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = Path(__file__).parent
INK = '#1d1d1f'      # --certa-text (light)
TILE = '#2b2b2e'     # --certa-action
MUTED = '#5f6168'    # --certa-muted
WHITE = '#ffffff'

# ------------------------------------------------------------------ geometry (64-unit grid)

def offset_line(p, q, d):
    dx, dy = q[0] - p[0], q[1] - p[1]
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    return (p[0] + nx * d, p[1] + ny * d), (q[0] + nx * d, q[1] + ny * d)

def intersect(a1, a2, b1, b2):
    (x1, y1), (x2, y2), (x3, y3), (x4, y4) = a1, a2, b1, b2
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
    return px, py

def point_on(p, q, f):
    return p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f

def leg(bottom, top, t, base_y, side):
    """A thick stroke: horizontal cut at the base, perpendicular cut at the top."""
    # Legs grow outward from the reference triangle, which keeps the lens interior open.
    i0, i1 = offset_line(bottom, top, -t if side == 'left' else t)
    ob = intersect(bottom, top, (0, base_y), (64, base_y))
    ib = intersect(i0, i1, (0, base_y), (64, base_y))
    dx, dy = top[0] - bottom[0], top[1] - bottom[1]
    it = intersect(i0, i1, top, (top[0] - dy, top[1] + dx))
    return [ob, top, it, ib]

def d_poly(pts):
    return 'M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts) + ' Z'

APEX, BL, BR, T, BASE = (32, 6.5), (5.5, 47), (58.5, 47), 7.4, 47
BOWL_DEPTH, BOWL_W = 11.5, 5.4

def lens():
    """Arkhon split peak (right leg starts lower, like the Arkhon A) over a horizon bowl."""
    left = leg(BL, APEX, T, BASE, 'left')
    right = leg(BR, point_on(APEX, BR, 0.21), T, BASE, 'right')
    y0, d = BASE, BOWL_DEPTH
    bowl = (f'M{BL[0]:.2f} {y0} Q32 {y0 + 2 * d:.2f} {BR[0]:.2f} {y0} '
            f'L{BR[0] - T * 1.1:.2f} {y0} Q32 {y0 + 2 * (d - BOWL_W):.2f} {BL[0] + T * 1.1:.2f} {y0} Z')
    return [d_poly(left), d_poly(right), bowl]

def check_glyph():
    """Bold check as a filled polygon (miter joins), optically centered in the lens."""
    cx, cy, s, w = 32, 38.6, 1.12, 5.9
    pts = [(cx - 9.5 * s, cy - 0.5 * s), (cx - 3 * s, cy + 6 * s), (cx + 9.5 * s, cy - 7 * s)]
    # outline the polyline with half-width w/2 on each side
    def norm(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy)
        return -dy / L * w / 2, dx / L * w / 2
    n1, n2 = norm(pts[0], pts[1]), norm(pts[1], pts[2])
    a_l = [(pts[0][0] + n1[0], pts[0][1] + n1[1]), (pts[1][0] + n1[0], pts[1][1] + n1[1])]
    b_l = [(pts[1][0] + n2[0], pts[1][1] + n2[1]), (pts[2][0] + n2[0], pts[2][1] + n2[1])]
    a_r = [(pts[0][0] - n1[0], pts[0][1] - n1[1]), (pts[1][0] - n1[0], pts[1][1] - n1[1])]
    b_r = [(pts[1][0] - n2[0], pts[1][1] - n2[1]), (pts[2][0] - n2[0], pts[2][1] - n2[1])]
    j_l = intersect(*a_l, *b_l)
    j_r = intersect(*a_r, *b_r)
    return [d_poly([a_l[0], j_l, b_l[1], b_r[1], j_r, a_r[0]])]

def pupil_glyph():
    """Solid pupil with a cut-out highlight (even-odd), so it works on any background."""
    cx, cy, r = 32, 38.6, 7.8
    hx, hy, hr = cx + 3.1, cy - 3.1, r * 0.3
    circ = lambda x, y, rr: f'M{x - rr:.2f} {y:.2f} a{rr:.2f} {rr:.2f} 0 1 0 {2 * rr:.2f} 0 a{rr:.2f} {rr:.2f} 0 1 0 {-2 * rr:.2f} 0 Z'
    return [circ(cx, cy, r) + ' ' + circ(hx, hy, hr)]

def mark_box():
    """Square box (x, y, size) that tightly contains the drawn mark, centered."""
    left = leg(BL, APEX, T, BASE, 'left')
    right = leg(BR, point_on(APEX, BR, 0.21), T, BASE, 'right')
    xs = [p[0] for p in left + right]
    ys = [p[1] for p in left + right] + [BASE + BOWL_DEPTH]  # bowl's lowest point
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    size = max(w, h)
    return min(xs) - (size - w) / 2, min(ys) - (size - h) / 2, size

PRODUCTS = {
    'certa': {'name': 'CERTA', 'glyph': check_glyph, 'tagline': 'Flight operations & compliance'},
    'argus': {'name': 'ARGUS', 'glyph': pupil_glyph, 'tagline': 'The platform that runs every job'},
}

def mark_paths(product):
    return lens() + PRODUCTS[product]['glyph']()

def path_el(d, fill):
    return f'<path fill="{fill}" fill-rule="evenodd" d="{d}"/>'

# ------------------------------------------------------------------ text outlines

class Outliner:
    def __init__(self, ttf):
        self.font = TTFont(ttf)
        self.gs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.upm = self.font['head'].unitsPerEm
        self.cap = getattr(self.font['OS/2'], 'sCapHeight', 0.7 * self.upm)

    def text(self, s, x, baseline, size, tracking_em=0.0):
        """Returns (svg path d, advance width) for `s` set at `size` px."""
        scale = size / self.upm
        pen = SVGPathPen(self.gs)
        cursor = x
        for ch in s:
            gname = self.cmap[ord(ch)]
            g = self.gs[gname]
            g.draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
            cursor += g.width * scale + tracking_em * size
        width = cursor - x - tracking_em * size
        return pen.getCommands(), width

# ------------------------------------------------------------------ files

def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')

def build(semibold, medium):
    bold, med = Outliner(semibold), Outliner(medium)
    for product, meta in PRODUCTS.items():
        d = OUT / product
        d.mkdir(exist_ok=True)
        paths = mark_paths(product)
        title = f'{meta["name"].title()} by Arkhon Industries'

        bx, by, bs = mark_box()
        fit = lambda size, x0, y0: f'translate({x0:.2f} {y0:.2f}) scale({size / bs:.5f}) translate({-bx:.3f} {-by:.3f})'
        for variant, fill in [('', INK), ('-white', WHITE)]:
            body = f'<g transform="{fit(64, 0, 0)}">' + ''.join(path_el(p, fill) for p in paths) + '</g>'
            (d / f'{product}-mark{variant}.svg').write_text(svg(64, 64, body, meta['name'].title()))

        # App icon: charcoal tile (iOS-style corner), white mark at ~64% of the tile.
        s = 1024
        inner = 0.66 * s
        off = (s - inner) / 2
        g = f'<g transform="{fit(inner, off, off)}">' + ''.join(path_el(p, WHITE) for p in paths) + '</g>'
        (d / f'{product}-app-icon.svg').write_text(svg(s, s, f'<rect width="{s}" height="{s}" rx="{0.225 * s:.0f}" fill="{TILE}"/>{g}', meta['name'].title()))
        # Maskable (Android adaptive): full-bleed tile, mark inside the 80% safe zone.
        inner = 0.52 * s
        off = (s - inner) / 2
        g = f'<g transform="{fit(inner, off, off)}">' + ''.join(path_el(p, WHITE) for p in paths) + '</g>'
        (d / f'{product}-app-icon-maskable.svg').write_text(svg(s, s, f'<rect width="{s}" height="{s}" fill="{TILE}"/>{g}', meta['name'].title()))

        # Horizontal lockup: mark | NAME over "BY ARKHON INDUSTRIES".
        for variant, fg, sub in [('', INK, MUTED), ('-white', WHITE, '#b3b3bc')]:
            mark_h = 64
            name_size = 34
            name_d, name_w = bold.text(meta['name'], 0, 0, name_size, tracking_em=0.16)
            sub_d, sub_w = med.text('BY ARKHON INDUSTRIES', 0, 0, 9.2, tracking_em=0.24)
            gap = 18
            cap = bold.cap * name_size / bold.upm
            # vertically center the text block (cap height + gap + descriptor cap) on the lens
            block = cap + 9 + med.cap * 9.2 / med.upm
            top = 32 - block / 2
            name_base = top + cap
            sub_base = name_base + 9 + med.cap * 9.2 / med.upm
            tx = mark_h + gap
            W = tx + max(name_w, sub_w) + 2
            body = (f'<g transform="{fit(64, 0, 0)}">' + ''.join(path_el(p, fg) for p in paths) + '</g>'
                    + f'<path fill="{fg}" transform="translate({tx:.2f} {name_base:.2f})" d="{name_d}"/>'
                    + f'<path fill="{sub}" transform="translate({tx + 1.5:.2f} {sub_base:.2f})" d="{sub_d}"/>')
            (d / f'{product}-lockup{variant}.svg').write_text(svg(W, 64, body, title))

        # Wordmark alone (for tight spaces next to an existing mark).
        name_d, name_w = bold.text(meta['name'], 0, 0, 34, tracking_em=0.16)
        cap = bold.cap * 34 / bold.upm
        (d / f'{product}-wordmark.svg').write_text(svg(name_w + 2, cap + 2, f'<path fill="{INK}" transform="translate(1 {cap + 1:.2f})" d="{name_d}"/>', meta['name'].title()))
    # Same geometry for the web app's inline logo component.
    bx, by, bs = mark_box()
    ts = ['// GENERATED by brand/build.py — do not edit. Mark paths (fill-rule evenodd); render with MARK_VIEWBOX.',
          f'export const MARK_VIEWBOX = "{bx:.3f} {by:.3f} {bs:.3f} {bs:.3f}";']
    for product in PRODUCTS:
        ts.append(f'export const {product.upper()}_MARK_PATHS = {mark_paths(product)!r} as const;'.replace("'", '"'))
    web = OUT.parent / 'apps' / 'web' / 'src' / 'components' / 'brand-marks.ts'
    web.write_text('\n'.join(ts) + '\n')
    print('built', ', '.join(PRODUCTS))

if __name__ == '__main__':
    build(os.environ['GEIST_SEMIBOLD'], os.environ['GEIST_MEDIUM'])
