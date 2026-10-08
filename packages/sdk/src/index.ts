/**
 * Typed Certa API client. Types are generated from contract/openapi.yaml (`pnpm --filter
 * @certa/sdk gen`), so the client always matches the server's route schemas.
 */
import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from './schema.js';

export type { components, paths };
export type Schemas = components['schemas'];

export interface CertaClientOptions {
  /** API origin; '' for same-origin (web behind Caddy). */
  baseUrl?: string;
  /** Mobile: bearer token from the session; web uses the session cookie instead. */
  getToken?: () => string | null | Promise<string | null>;
  fetch?: typeof fetch;
}

export class CertaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function createCertaClient(opts: CertaClientOptions = {}) {
  const client = createClient<paths>({
    baseUrl: opts.baseUrl ?? '',
    credentials: 'include',
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  if (opts.getToken) {
    const auth: Middleware = {
      async onRequest({ request }) {
        const token = await opts.getToken!();
        if (token) request.headers.set('authorization', `Bearer ${token}`);
        return request;
      },
    };
    client.use(auth);
  }
  return client;
}

export type CertaClient = ReturnType<typeof createCertaClient>;

/** Unwraps an openapi-fetch result, throwing CertaApiError on non-2xx. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok) return result.data as T;
  const err = (result.error ?? {}) as { error?: { code?: string; message?: string; requestId?: string; details?: unknown } };
  throw new CertaApiError(
    result.response.status,
    err.error?.code ?? 'http_error',
    err.error?.message ?? `Request failed (${result.response.status})`,
    err.error?.requestId,
    err.error?.details,
  );
}
