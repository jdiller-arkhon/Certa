#!/usr/bin/env python3
"""
Builds the Certa and Argus logo families. Reproducible.

    pip install fonttools shapely
    GEIST_SEMIBOLD=.../Geist-SemiBold.ttf GEIST_MEDIUM=.../Geist-Medium.ttf python3 brand/build.py
    node brand/render.mjs        # PNG exports

Direction (brand/README.md): "Apple × Perplexity". Perplexity-style monoline glyphs drawn on the
Arkhon triangle (one stroke weight, round caps and joins), set on Apple-style continuous-curvature
app tiles with real light: a top-lit charcoal gradient, a soft sheen, and a silver mark with glow.
  Certa — the check closes the triangle: the check's long arm IS the triangle's left side.
  Argus — the aperture: three blades turn inside the triangle (exact 3-fold symmetry).
Marks are exported as filled outlines (strokes pre-expanded), so every tool renders them the same.
"""
import math
import os
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from shapely.geometry import LineString, MultiLineString
from shapely.ops import unary_union

OUT = Path(__file__).parent
INK, MUTED, WHITE, MUTED_DARK = '#1d1d1f', '#5f6168', '#ffffff', '#b3b3bc'

# ------------------------------------------------------------------ marks (64-unit grid)

V = [(32, 7.5), (58.5, 53.5), (5.5, 53.5)]   # Arkhon triangle: apex, right, left
STROKE = 4.6                                 # display sizes
STROKE_SMALL = 6.2                           # ≤ 32 px

def lerp(a, b, t):
    return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t

def certa_lines():
    """Check (short arm → vertex) whose long arm rises as the triangle's left side, over → right
    side → base. One continuous line."""
    return [[(8.5, 33), (20.5, 45), V[0], V[1], (9, V[2][1])]]

def argus_lines(t=0.33):
    """Triangle + three blades: each vertex aims at the point t along the opposite edge and stops
    where it meets the next blade, leaving a turned inner triangle."""
    blades = [(V[i], lerp(V[(i + 1) % 3], V[(i + 2) % 3], t)) for i in range(3)]
    lines = [[V[0], V[1], V[2], V[0]]]
    for i in range(3):
        a, p = blades[i]
        hit = LineString([a, p]).intersection(LineString(blades[(i + 1) % 3]))
        lines.append([a, (hit.x, hit.y)])
    return lines

PRODUCTS = {
    'certa': {'name': 'Certa', 'lines': certa_lines},
    'argus': {'name': 'Argus', 'lines': argus_lines},
}

def outline(lines, w):
    """Expand strokes to filled geometry with round caps/joins."""
    return unary_union([LineString(l).buffer(w / 2, cap_style='round', join_style='round', quad_segs=16) for l in lines])

def d_of(geom):
    polys = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
    out = []
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            out.append('M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in c) + ' Z')
    return ' '.join(out)

def viewbox(geom, pad=0.0):
    """Square box centered on the mark's bounds, nudged so the triangle reads optically centered."""
    x0, y0, x1, y1 = geom.bounds
    size = max(x1 - x0, y1 - y0) + 2 * pad
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - (y1 - y0) * 0.035  # triangles look high when centered
    return (cx - size / 2, cy - size / 2, size, size)

# ------------------------------------------------------------------ Apple-style app tile

def squircle(size, n=5.0, steps=360):
    a = size / 2
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append(f'{a + a * abs(c) ** (2 / n) * (1 if c >= 0 else -1):.2f} {a + a * abs(s) ** (2 / n) * (1 if s >= 0 else -1):.2f}')
    return 'M' + ' L'.join(pts) + ' Z'

def app_icon(d, vb, size=1024, theme='dark', shape='squircle', mark_frac=0.6):
    sq = squircle(size) if shape == 'squircle' else f'M0 0 H{size} V{size} H0 Z'
    k = size * mark_frac / vb[2]
    off = size * (1 - mark_frac) / 2
    place = f'translate({off:.2f} {off:.2f}) scale({k:.5f}) translate({-vb[0]:.3f} {-vb[1]:.3f})'
    if theme == 'dark':
        bg, sheen, mark, glow, edge = (('#3b3b40', '#0d0d0f'), 0.17, ('#ffffff', '#c4c4cc'), ('#ffffff', 0.38), ('#ffffff', 0.10))
    else:
        bg, sheen, mark, glow, edge = (('#ffffff', '#e9e9ee'), 0.0, ('#3b3b40', '#0d0d0f'), ('#000000', 0.16), ('#000000', 0.08))
    return f'''<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg[0]}"/><stop offset="1" stop-color="{bg[1]}"/></linearGradient>
<radialGradient id="sheen" cx="0.5" cy="-0.05" r="0.95"><stop offset="0" stop-color="#fff" stop-opacity="{sheen}"/><stop offset="0.65" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="mark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{mark[0]}"/><stop offset="1" stop-color="{mark[1]}"/></linearGradient>
<filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="{size * 0.022:.1f}"/></filter>
<clipPath id="tile"><path d="{sq}"/></clipPath>
</defs>
<g clip-path="url(#tile)"><path d="{sq}" fill="url(#bg)"/><path d="{sq}" fill="url(#sheen)"/>
<path transform="{place}" d="{d}" fill="{glow[0]}" opacity="{glow[1]}" filter="url(#glow)"/>
<path transform="{place}" d="{d}" fill="url(#mark)" fill-rule="nonzero"/></g>
<path d="{sq}" fill="none" stroke="{edge[0]}" stroke-opacity="{edge[1]}" stroke-width="{size * 0.006:.1f}"/>'''

# ------------------------------------------------------------------ type

class Outliner:
    def __init__(self, ttf):
        self.font = TTFont(ttf)
        self.gs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.upm = self.font['head'].unitsPerEm
        os2 = self.font['OS/2']
        self.cap, self.xh = os2.sCapHeight, os2.sxHeight

    def text(self, s, size, tracking_em=0.0):
        scale = size / self.upm
        pen = SVGPathPen(self.gs)
        x = 0.0
        for i, ch in enumerate(s):
            g = self.gs[self.cmap[ord(ch)]]
            g.draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
            x += g.width * scale + (tracking_em * size if i < len(s) - 1 else 0)
        return pen.getCommands(), x

def svg(w, h, body, title, vb=None):
    vb = vb or f'0 0 {w:.2f} {h:.2f}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')

def fmt_vb(vb):
    return ' '.join(f'{v:.3f}' for v in vb)

def build(semibold, medium, case='lower'):
    sb, md = Outliner(semibold), Outliner(medium)
    ts = ['// GENERATED by brand/build.py — do not edit. Marks are filled outlines (render with fill).']
    for product, meta in PRODUCTS.items():
        out = OUT / product
        out.mkdir(exist_ok=True)
        for old in out.glob('*.svg'):
            old.unlink()
        name = meta['name'].lower() if case == 'lower' else meta['name']
        geom = outline(meta['lines'](), STROKE)
        geom_s = outline(meta['lines'](), STROKE_SMALL)
        d, d_s = d_of(geom), d_of(geom_s)
        vb, vb_s = viewbox(geom), viewbox(geom_s)

        for variant, fill in [('', INK), ('-white', WHITE)]:
            (out / f'{product}-mark{variant}.svg').write_text(svg(64, 64, f'<path fill="{fill}" d="{d}"/>', meta['name'], fmt_vb(vb)))
            (out / f'{product}-mark-small{variant}.svg').write_text(svg(64, 64, f'<path fill="{fill}" d="{d_s}"/>', meta['name'], fmt_vb(vb_s)))

        S = 1024
        (out / f'{product}-app-icon.svg').write_text(svg(S, S, app_icon(d, vb, S, 'dark'), meta['name']))
        (out / f'{product}-app-icon-light.svg').write_text(svg(S, S, app_icon(d, vb, S, 'light'), meta['name']))
        (out / f'{product}-app-icon-small.svg').write_text(svg(S, S, app_icon(d_s, vb_s, S, 'dark', mark_frac=0.64), meta['name']))
        (out / f'{product}-app-icon-maskable.svg').write_text(svg(S, S, app_icon(d, vb, S, 'dark', shape='square', mark_frac=0.46), meta['name']))

        # Wordmark: Geist SemiBold, tight like the app's headlines.
        H, size = 64, 42
        word_d, word_w = sb.text(name, size, tracking_em=-0.03)
        xh = (sb.xh if case == 'lower' else sb.cap) * size / sb.upm
        gap = 0.26 * H
        k = H / vb[2]
        mark_el = lambda fill: f'<path fill="{fill}" transform="scale({k:.5f}) translate({-vb[0]:.3f} {-vb[1]:.3f})" d="{d}"/>'
        base = H / 2 + xh / 2 + 2
        for variant, fg in [('', INK), ('-white', WHITE)]:
            body = mark_el(fg) + f'<path fill="{fg}" transform="translate({H + gap:.2f} {base:.2f})" d="{word_d}"/>'
            (out / f'{product}-lockup{variant}.svg').write_text(svg(H + gap + word_w + 1, H, body, f'{meta["name"]} by Arkhon Industries'))
        sub_size = 12.5
        sub_d, sub_w = md.text('by Arkhon Industries', sub_size)
        sub_xh = md.xh * sub_size / md.upm
        block = xh + 10 + sub_xh
        top = H / 2 - block / 2 + 2
        for variant, fg, sub in [('', INK, MUTED), ('-white', WHITE, MUTED_DARK)]:
            body = (mark_el(fg) + f'<path fill="{fg}" transform="translate({H + gap:.2f} {top + xh:.2f})" d="{word_d}"/>'
                    + f'<path fill="{sub}" transform="translate({H + gap + 1.5:.2f} {top + xh + 10 + sub_xh + 1:.2f})" d="{sub_d}"/>')
            (out / f'{product}-lockup-endorsed{variant}.svg').write_text(svg(H + gap + max(word_w, sub_w) + 1, H, body, f'{meta["name"]} by Arkhon Industries'))
        asc = sb.cap * size / sb.upm
        (out / f'{product}-wordmark.svg').write_text(svg(word_w + 2, asc + 2, f'<path fill="{INK}" transform="translate(1 {asc + 1:.2f})" d="{word_d}"/>', meta['name']))

        P = product.upper()
        word_ts, word_w_ts = sb.text(name, 40, tracking_em=-0.03)
        ts += [
            f'export const {P}_MARK = {{ d: "{d}", viewBox: "{fmt_vb(vb)}" }} as const;',
            f'export const {P}_MARK_SMALL = {{ d: "{d_s}", viewBox: "{fmt_vb(vb_s)}" }} as const;',
            f'/** Stroke centerlines (64 grid, stroke {STROKE}) — for draw-on animation. */',
            f'export const {P}_MARK_LINES = {[[list(map(lambda v: round(v, 2), p)) for p in l] for l in meta["lines"]()]!r};'.replace("'", '"'),
            f'export const {P}_WORDMARK = {{ d: "{word_ts}", width: {word_w_ts:.2f}, xHeight: {(sb.xh if case == "lower" else sb.cap) * 40 / sb.upm:.2f}, ascent: {sb.cap * 40 / sb.upm:.2f} }} as const;',
        ]
    ts.append(f'export const MARK_STROKE = {STROKE};')
    (OUT.parent / 'apps' / 'web' / 'src' / 'components' / 'brand-marks.ts').write_text('\n'.join(ts) + '\n')
    print('built', ', '.join(PRODUCTS), f'({case})')

if __name__ == '__main__':
    build(os.environ['GEIST_SEMIBOLD'], os.environ['GEIST_MEDIUM'], os.environ.get('WORDMARK_CASE', 'lower'))
