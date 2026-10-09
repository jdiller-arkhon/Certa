# Arkhon product marks: Certa and Argus

## The system

Every Arkhon product mark is the **solid Arkhon triangle**, cut by channels of one width into
facets. The channels draw the product's idea in **negative space**:

| Product | Cut | Meaning |
|---|---|---|
| **Certa** | A check | The verified record: "prove it" in under a minute |
| **Argus** | Three paths meeting at a hub | The platform every job runs through (the hub echoes the central node in the Argus hero on arkhonindustries.com) |

**Why it works:**

- One shape with one silhouette: a triangle, the Arkhon form.
- Recognizable at 16 px; the idea reveals itself at a second glance.
- New products extend the family with a new cut: same triangle, same channel width, same corner radius.

**Wordmark:** Geist SemiBold, sentence case, −0.025em tracking, matching the app's headlines and
the Arkhon site's type. It is converted to outlines, so the files need no fonts.

## Files

Each product folder (`certa/`, `argus/`) contains:

| File | Use |
|---|---|
| `<p>-lockup.svg` / `-white` | **Primary.** Mark + wordmark, for light / dark backgrounds. |
| `<p>-lockup-endorsed.svg` / `-white` | With "by Arkhon Industries". Use where the Arkhon connection isn't otherwise clear (sign-in, marketing, documents). |
| `<p>-mark.svg` / `-white` | Mark alone, 32 px and up. |
| `<p>-mark-small.svg` / `-white` | Mark alone at **24 px and below** (wider channels survive pixelation). |
| `<p>-wordmark.svg` | Wordmark alone, when the mark is already nearby. |
| `<p>-app-icon.svg` | App icon: charcoal tile `#2b2b2e`, white mark, iOS-style corners. |
| `<p>-app-icon-small.svg` | App icon for 48 px and below (favicons). |
| `<p>-app-icon-maskable.svg` | Full-bleed tile, mark inside the safe zone (Android / PWA maskable). |
| `png/` | Exports: app icons 16–1024 px, maskable 512, marks 512, lockups @4x. |

The Certa web app uses the same geometry. `apps/web/src/components/brand-marks.ts` is
generated, and `apps/web/public/icons/*` are copied from `certa/png`.

## Rules

- **Color:** ink `#1d1d1f` on light, white on dark or on the charcoal tile. Single color only: no status colors, gradients, or outlines.
- **Clear space:** at least the height of the mark × 0.25 on every side.
- **Minimum size:** lockup 20 px tall; mark 16 px (use the `-small` files at 24 px and below).
- **Don't** rotate, stretch, recolor parts, re-space the wordmark, or redraw the cuts. Change geometry only in `build.py` and rebuild.
- **Never** put a circle or "eye" in the center of the triangle. That reads as the Eye of Providence.

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
