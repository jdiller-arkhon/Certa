# Frontend Integration Issues

Minimal fixes Claude Code applied to frontend-owned files, or integration notes. Frontend
files are never restyled or restructured; each entry lists file, problem, and fix.

| Date | File | Problem | Fix |
|---|---|---|---|
| 2026-10-08 | `packages/ui/` (new `package.json`) | The theme foundation had no `package.json`, so apps could not depend on it as a workspace package. | Added `packages/ui/package.json` (`@certa/ui`) exporting `tokens.ts`, `theme.css`, and `tailwind.preset.ts` as source. No frontend file was modified. |
| 2026-10-08 | `packages/ui/tailwind.preset.ts` | Imports `./tokens` without an extension; fine for bundlers, not resolvable under Node ESM (`NodeNext`). | No change. The package is consumed only through bundlers (Next.js `transpilePackages`, Metro). Noted in case a Node-side consumer is added. |
