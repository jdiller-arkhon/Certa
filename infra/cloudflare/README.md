# Deploying Certa on Cloudflare

Certa runs at `https://arkhonindustries.com/certa` on Cloudflare Containers. Nothing else on the
Arkhon website changes: a Worker route claims `/certa*` and runs before the site's own Worker.

```
Browser ─► arkhonindustries.com/certa/… ─► Worker "certa" (this folder)
                                             ├─ /certa/api/*, /certa/healthz, /certa/readyz ─► API container
                                             └─ everything else ────────────────────────────► web container
           Cron, daily 07:00 Denver ─────────► jobs container (expiry reminders), then exits

API and jobs ─► Neon Postgres "Certa" (Arkhon Industries org, AWS us-east-1)
             ─► R2 bucket "certa-files" (uploads: 3D models, documents)
             ─► your SMTP relay (sign-in links, reminders)
```

## Already done

- **Database:** Neon project **Certa** (`lingering-shadow-69405798`), branch `production`,
  database `certa`. All migrations are applied, with forced row-level security on every tenant
  table. The FAA Part 107 rule pack and the job queue are loaded. The app connects as
  `certa_api`, a login with no RLS bypass.
- **Storage:** R2 bucket **certa-files**.
- **Code:** this Worker (`src/index.ts`) and `wrangler.jsonc`. The images build from
  `infra/docker/Dockerfile` with `TARGET=web` / `TARGET=api`. Both were built and smoke-tested
  locally (sign-up, missions, log flight, install page, manifest, service worker).

## What you need to do (about 20 minutes)

You need a computer with **Node 22+** and **Docker Desktop running**.

### 1. Turn on Workers Paid

Cloudflare dashboard → **Workers & Pages** → **Plans** → **Workers Paid** ($5/month for the
account; it also covers your other Workers). Containers aren't available on the free plan.

### 2. Create an R2 key for uploads

Dashboard → **R2** → **Manage R2 API Tokens** → **Create API token**:

- Permissions: **Object Read & Write**
- Specify bucket: **certa-files**

Keep the **Access Key ID**, the **Secret Access Key**, and the S3 endpoint
(`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).

### 3. Set the database password for the app

In the Neon console, open project **Certa** → **SQL Editor** (database `certa`) and run, with a
long random password of your own:

```sql
ALTER ROLE certa_api PASSWORD 'paste-a-long-random-password-here';
```

Your connection string is then:

```
postgresql://certa_api:<that password>@ep-dark-pond-b8trl4sg.c-14.us-east-1.aws.neon.tech/certa?sslmode=require
```

Use this direct host, not the `-pooler` one.

### 4. Set up email (Resend)

Certa sends sign-in links and expiry reminders over SMTP. Arkhon uses [Resend](https://resend.com):
add and verify `arkhonindustries.com` under **Domains** (its DNS records don't affect Microsoft 365
mail), then create an API key with **Sending access** for that domain. The SMTP URL is:

```
smtps://resend:<API key>@smtp.resend.com:465
```

The sending address must be on the verified domain and match `MAIL_FROM` in `wrangler.jsonc`
(`certa@arkhonindustries.com`). Microsoft 365 password SMTP isn't used: Microsoft is turning it
off by default at the end of 2026.

### 5. Deploy

```bash
cd infra/cloudflare
npm install
npx wrangler login

# Secrets: you're prompted for each value. Nothing is stored in the repo.
npx wrangler secret put DATABASE_URL           # from step 3
npx wrangler secret put AUTH_SECRET            # output of: openssl rand -hex 32
npx wrangler secret put SMTP_URL               # from step 4 (Resend)
npx wrangler secret put S3_ENDPOINT            # https://<ACCOUNT_ID>.r2.cloudflarestorage.com
npx wrangler secret put S3_ACCESS_KEY_ID       # from step 2
npx wrangler secret put S3_SECRET_ACCESS_KEY   # from step 2
# Optional:
npx wrangler secret put DISCORD_BOT_API_TOKEN  # 32+ chars; also give it to the Certa bot
npx wrangler secret put VAPID_PUBLIC_KEY       # push notifications: npx web-push generate-vapid-keys
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT          # mailto:jdiller@arkhonindustries.com

npx wrangler deploy
```

The first deploy builds both images and takes a few minutes. Wrangler may say it can't add the
secrets until the Worker exists. If so, run `npx wrangler deploy` once, then the secret commands,
then deploy again.

### 6. Check it

- `https://arkhonindustries.com/certa/readyz` should return `{"status":"ok",…,"database":"ok"}`.
- Open `https://arkhonindustries.com/certa` and create your organization.
- The first visit after a quiet spell can take a few seconds while the containers wake up.

Logs: `npx wrangler tail`, or the dashboard under **Workers & Pages → certa → Logs**.

## Updating later

From `main`: `cd infra/cloudflare && npx wrangler deploy`. If a release adds database
migrations, run them first. In the Docker setup the `migrate` service runs them on every start;
here, run the API image once with `DATABASE_ADMIN_URL` set to the Neon owner connection string:

```bash
docker build -f infra/docker/Dockerfile --build-arg TARGET=api -t certa-api .   # from the repo root
docker run --rm -e DATABASE_ADMIN_URL='postgresql://certa_owner:…@ep-dark-pond-b8trl4sg.c-14.us-east-1.aws.neon.tech/certa?sslmode=require' \
  certa-api node dist/migrate.js
```

The migration script is idempotent.

## Costs

- Workers Paid: $5/month (account-wide).
- Containers: billed only while awake. Containers sleep after 20 idle minutes; office-hours use
  should stay close to the included allowance. Expect roughly $0–5/month on top.
- Neon free tier and R2 free tier (10 GB): $0 at this size.
