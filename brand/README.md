# Arkhon product marks: Certa and Argus

One family, built from the Arkhon mark.

**The lens.** The Arkhon *split peak* (two bold strokes, with the right one starting lower than
the left as in the Arkhon "A") sits over the Arkhon *horizon* (here a crescent bowl). Together
they form a lens. Each product puts one glyph in the center:

| Product | Glyph | Meaning |
|---|---|---|
| **Certa** | Check | The verified record: "prove it" in under a minute |
| **Argus** | Pupil | The platform that sees and runs every job |

Future Arkhon products can follow the same rule: same lens, one new glyph.

## Files

Each product folder (`certa/`, `argus/`) contains:

| File | Use |
|---|---|
| `<p>-lockup.svg` / `-lockup-white.svg` | Primary logo: mark + wordmark + "BY ARKHON INDUSTRIES". Light / dark backgrounds. |
| `<p>-mark.svg` / `-mark-white.svg` | Mark alone (nav bars, favicons, avatars, small spaces). |
| `<p>-wordmark.svg` | Wordmark alone, when the mark is already present nearby. |
| `<p>-app-icon.svg` | App icon: charcoal tile, white mark (iOS-style corners baked in). |
| `<p>-app-icon-maskable.svg` | Full-bleed tile for Android adaptive / PWA maskable icons. |
| `png/` | Rendered exports: app icons 16–1024 px, maskable 512, marks 512, lockups @4x. |

The Certa app uses these directly: `apps/web/public/icons/*` and
`apps/web/src/components/brand-marks.ts` (inline mark) are generated from the same geometry.

## Rules

- **Color:** ink `#1d1d1f` on light, white on dark, white on the charcoal tile `#2b2b2e`. The marks are single-color by design. Never apply status colors (green/amber/red) or gradients to them.
- **Clear space:** at least the width of one peak stroke (about 12% of the mark's height) on every side.
- **Minimum size:** mark 16 px (favicon), lockup 24 px tall on screen. Below 24 px use the mark alone.
- **Don't** rotate, outline, add effects, re-space the wordmark, or redraw the glyph. Change the geometry only in `build.py` and rebuild.
- **Wordmark:** Geist SemiBold, caps, +0.16em tracking. Descriptor: Geist Medium, caps, +0.24em. Converted to outlines, so no font is needed to display the files.

## Rebuild

```bash
npm pack geist@1.4.2 && tar xzf geist-1.4.2.tgz        # Geist is SIL OFL
GEIST_SEMIBOLD=package/dist/fonts/geist-sans/Geist-SemiBold.ttf \
GEIST_MEDIUM=package/dist/fonts/geist-sans/Geist-Medium.ttf \
  python3 brand/build.py                                 # SVGs + apps/web/src/components/brand-marks.ts
node brand/render.mjs                                    # PNG exports (headless Chromium)
```

Requires `pip install fonttools`. After rebuilding, copy the Certa PNGs into
`apps/web/public/icons/` (192, 512, maskable 512, apple-touch 180, favicon 32, icon.svg).
