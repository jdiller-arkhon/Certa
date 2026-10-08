# Certa Contract

The single source of truth shared by the backend/integration (Claude Code) and the
presentational frontend (ChatGPT).

| File | What it is |
|---|---|
| `types.ts` | Every view-model and screen-props type, re-exported from `@certa/core`. |
| `SCREENS.md` | Every screen: route, props type, callbacks, status, states, and notes. |
| `openapi.yaml` | Full REST API spec, **generated** from the API route schemas. |
| `fixtures/` | Typed, realistic mock data for every screen and state, **generated** by the same mappers the app uses. |
| `CHANGELOG.md` | Contract versions and the screens each change affects. |
| `FRONTEND_ISSUES.md` | Minimal fixes applied to frontend files during integration. |

Regenerate after changing core types or API routes:

```bash
pnpm contract:gen                               # openapi.yaml
pnpm --filter @certa/contract gen:fixtures      # fixtures/*.ts
pnpm contract:check                             # CI: fails if anything is stale
```

Use the fixtures in a component preview:

```ts
import { company, states } from '@certa/contract/fixtures';
<TodayScreen {...company.screens.readinessDashboard} onAddPilot={…} … />
<TodayScreen {...company.screens.readinessDashboard} {...states.partial} … />
```
