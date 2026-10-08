# syntax=docker/dockerfile:1.7
# One build for the whole monorepo; `--target api` or `--target web` selects the runtime image.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS build
# '/certa' for the hosted app on the Arkhon website; '' for a self-hosted install at a domain root.
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# Build libraries and the API, then the web app (API_ORIGIN unset: Caddy serves /api on the same origin).
RUN pnpm --filter @certa/core --filter @certa/rulepacks --filter @certa/db --filter @certa/sdk --filter @certa/api build \
 && pnpm --filter @certa/web build

# ---------------------------------------------------------------- API + worker + migrator
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

# ---------------------------------------------------------------- Web (Next.js standalone)
FROM base AS web
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000'+(process.env.NEXT_PUBLIC_BASE_PATH||'')+'/sign-in').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
