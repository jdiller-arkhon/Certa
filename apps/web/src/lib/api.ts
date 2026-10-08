import { createCertaClient } from '@certa/sdk';
import { BASE_PATH } from './base-path';

/** Same-origin client under the base path; the session cookie (scoped to it) authenticates. */
export const api = createCertaClient({ baseUrl: BASE_PATH });
