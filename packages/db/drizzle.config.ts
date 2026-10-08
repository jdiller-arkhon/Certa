import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/certa' },
  strict: true,
});
