import { createCertaClient } from '@certa/sdk';

/** Same-origin client; the session cookie authenticates requests. */
export const api = createCertaClient({ baseUrl: '' });
