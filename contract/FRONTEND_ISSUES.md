# Frontend Integration Issues

Minimal fixes Claude Code applied to frontend-owned files, or integration notes. Frontend
files are never restyled or restructured; each entry lists file, problem, and fix.

| Date | File | Problem | Fix |
|---|---|---|---|
| 2026-10-08 | `packages/ui/` (new `package.json`) | The theme foundation had no `package.json`, so apps could not depend on it as a workspace package. | Added `packages/ui/package.json` (`@certa/ui`) exporting `tokens.ts`, `theme.css`, and `tailwind.preset.ts` as source. No frontend file was modified. |
| 2026-10-08 | `packages/ui/tailwind.preset.ts` | Imports `./tokens` without an extension; fine for bundlers, not resolvable under Node ESM (`NodeNext`). | No change. The package is consumed only through bundlers (Next.js `transpilePackages`, Metro). Noted in case a Node-side consumer is added. |
| 2026-10-09 | `packages/ui/theme.css` (as imported by `apps/web/app/globals.css`) | Loaded as unlayered CSS, its `.certa :is(button, input, select, textarea) { font: inherit }` and other rules outrank every Tailwind utility, so text sizes on buttons and inputs were ignored. | No change to the file. The host now imports it with `@import '@certa/ui/theme.css' layer(base);` so utilities can refine it. Tokens are unaffected. |
| 2026-10-09 | `apps/web/src/screens/*`, `apps/web/src/components/*` | Owner asked Claude Code to build the UI directly ("work on the UI and make it awesome"). | Screens and components now live in `apps/web` and use the `packages/ui` tokens/theme unchanged. If ChatGPT resumes screen work, it should build on these files rather than replace them. |
