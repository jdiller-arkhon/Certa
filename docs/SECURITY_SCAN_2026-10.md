# Security scan — October 2026 (v1.0)

**Tool:** OWASP ZAP (stable), the open-source scanner HawkScan is built on.
**Target:** the v1.0 production images (`TARGET=api`, `TARGET=web`) running locally behind a
proxy with the same routing as the Cloudflare Worker, on a scratch database. Nothing was sent to
a live site.
**Coverage:**

- **API:** active attack scan of all 86 OpenAPI operations, signed in as an organization owner
  with real data (aircraft, mission), 231 URLs in total. The attacks covered SQL/NoSQL injection,
  command injection, template injection, cross-site scripting, path traversal, XXE, SSRF and
  more.
- **Web:** passive scan of the app's pages, found with the traditional and the JavaScript-aware
  (AJAX) spider, signed in.

## Results

| Scan | Passed | Failed | Warnings |
| ---- | ------ | ------ | -------- |
| API (active), after fixes | 113 | 0 | 2, both expected |
| Web (passive), after fixes | 58 | 0 | 3, all low or informational |

### Found and fixed

1. **Null characters caused server errors.** Text containing U+0000 reached Postgres, which
   rejects it, so the API answered 500 instead of 400. No data was exposed or changed. Fixed: the
   API now rejects null characters in any body, query or path value with a 400 (`apps/api/src/app.ts`;
   test in `apps/api/test/missions.test.ts`). The re-scan logged zero server errors.
2. **No Content Security Policy.** Fixed: production pages now send a CSP that allows only
   Certa's own origin. The one exception is Google's Draco decoder, which three.js fetches for
   compressed 3D models. The policy blocks framing (`frame-ancestors 'none'`), plugins, foreign
   scripts and connections to other hosts (`apps/web/next.config.ts`). A browser pass over every
   main page, including the 3D viewer, showed no violations, and all 13 end-to-end tests pass.

### Remaining warnings (accepted)

- **CSP allows inline scripts** (`'unsafe-inline'` in `script-src`). Next.js and the
  install-prompt capture use inline scripts. Removing this needs per-request nonces, which
  would make every page server-rendered on each request. The rest of the policy still limits
  what an injected script could reach. Low risk; revisit later.
- **503 from the Discord bot endpoints.** By design: they stay off until
  `DISCORD_BOT_API_TOKEN` is configured.
- **Unexpected content type / missing content type** on `/certa` (HTML from the web app on an
  API scan), on a 308 trailing-slash redirect, and on 404s for paths outside `/certa`. Expected.
  In production, paths outside `/certa` belong to the Arkhon site.
- **"Modern web application"**: informational only.

To re-run against a running copy (signed in by adding the session cookie and an `Origin` header
through ZAP's replacer, `-z "-config replacer.full_list(0)…"`):

```bash
docker run --rm --network host -v "$PWD:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py -t /zap/wrk/openapi-local.yaml -f openapi -r api-report.html   # openapi.yaml with a servers: entry
docker run --rm --network host -v "$PWD:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://localhost:8787/certa/ -j -r web-report.html
```
