# Arkhon product marks: Certa and Argus

## The system: "Apple × Perplexity"

- **Perplexity:** geometric, ownable marks built on the Arkhon triangle. certa is drawn as a single line; argus is cut as solid blades inside a fine line ring.
- **Apple:** app icons are continuous-curvature squircles with real light: a top-lit charcoal gradient, a soft sheen, a silver mark, and a gentle glow. Restraint everywhere else.

| Product | Mark | Meaning |
|---|---|---|
| **certa** | The check closes the triangle: one line whose check rises to become the triangle's side, then runs over the peak and along the base | The verified record: "prove it" in under a minute |
| **argus** | A shutter iris: three curved, individually lit metal blades in a fine ring, opening onto the Arkhon triangle turned 45° | The platform every job runs through, focused to one point |

**Siblings, not twins.** Both share the charcoal tile, the silver material and lighting, the line
weight, and the lowercase wordmark. They differ in **form**: certa is *drawn* (an open, pointed line)
and argus is *solid* (a closed, round, faceted disc). That reads instantly at any size without
relying on color.

**Wordmark:** lowercase Geist SemiBold, −0.03em, converted to outlines. **Family rule:** a new
product keeps the material, tile, and wordmark, and gets its own form.

## Files

Each product folder (`certa/`, `argus/`) contains:

| File | Use |
|---|---|
| `<p>-lockup.svg` / `-white` | **Primary.** Mark + wordmark, for light / dark backgrounds. |
| `<p>-lockup-endorsed.svg` / `-white` | With "by Arkhon Industries". Use where the Arkhon connection isn't otherwise clear (sign-in, marketing, documents). |
| `<p>-mark.svg` / `-white` | Mark alone, 32 px and up. |
| `<p>-mark-small.svg` / `-white` | Mark alone at **24 px and below** (heavier strokes survive pixelation). |
| `<p>-wordmark.svg` | Wordmark alone, when the mark is already nearby. |
| `<p>-app-icon.svg` | App icon, dark (primary): lit charcoal squircle, silver mark with glow. |
| `<p>-app-icon-light.svg` | App icon, light variant. |
| `<p>-app-icon-small.svg` | App icon for 48 px and below (favicons): heavier strokes. |
| `<p>-app-icon-maskable.svg` | Full-bleed square, mark inside the safe zone (Android / PWA maskable). |
| `png/` | Exports: app icons 16–1024 px, maskable 512, marks 512, lockups @4x. |

The Certa web app uses the same geometry. `apps/web/src/components/brand-marks.ts` is
generated (outlines, centerlines for animation, wordmark), and `apps/web/public/icons/*` are
copied from `certa/png`.

## Rules

- **Color:** flat ink `#1d1d1f` on light, flat white on dark. Light and gradient treatment only on app icons. No status colors on the marks.
- **Clear space:** at least the height of the mark × 0.25 on every side.
- **Minimum size:** lockup 20 px tall; mark 16 px (use the `-small` files at 24 px and below).
- **Don't** rotate, stretch, change the stroke weight, re-space the wordmark, or capitalize it. Change geometry only in `build.py` and rebuild.
- **Motion:** the marks may draw themselves (stroke draw-on along the centerlines exported as `*_MARK_LINES`), once, on entry. Respect reduced motion.
- **Never** put an eye in a triangle (it reads as the Eye of Providence). Never turn the argus opening upright (it reads as an A in a circle, the anarchy symbol) or pointing right (a play button). It is fixed at 45°.

## Rebuild

```bash
pip install fonttools shapely
npm pack geist@1.4.2 && tar xzf geist-1.4.2.tgz                         # Geist: SIL Open Font License
GEIST_SEMIBOLD=package/dist/fonts/geist-sans/Geist-SemiBold.ttf \
GEIST_MEDIUM=package/dist/fonts/geist-sans/Geist-Medium.ttf \
  python3 brand/build.py        # SVGs + apps/web/src/components/brand-marks.ts
node brand/render.mjs           # PNG exports (headless Chromium)
```

Then copy the Certa icons into `apps/web/public/icons/`: `icon-192`, `icon-512`,
`maskable-512`, `apple-touch-icon` (180), `favicon-32`, and `icon.svg` (from
`certa-app-icon-small.svg`).
