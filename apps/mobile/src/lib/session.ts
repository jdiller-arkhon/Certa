import * as SecureStore from 'expo-secure-store';
import { createCertaClient } from '@certa/sdk';
import { API_URL } from './config';

const TOKEN_KEY = 'certa.session';

/** Mobile authenticates with a bearer token (Better Auth bearer plugin), kept in the keychain. */
export const sessionStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

export const api = createCertaClient({ baseUrl: API_URL, getToken: sessionStore.get });

async function postAuth(path: string, body: object) {
  return fetch(`${API_URL}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: API_URL },
    body: JSON.stringify(body),
  });
}

export async function signInWithPassword(email: string, password: string): Promise<boolean> {
  const res = await postAuth('sign-in/email', { email, password });
  const token = res.headers.get('set-auth-token');
  if (!res.ok || !token) return false;
  await sessionStore.set(token);
  return true;
}

export async function requestMagicLink(email: string): Promise<void> {
  await postAuth('sign-in/magic-link', { email, callbackURL: 'certa://' });
}

export async function signOut(): Promise<void> {
  const token = await sessionStore.get();
  if (token) await fetch(`${API_URL}/api/auth/sign-out`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: API_URL }, body: '{}' }).catch(() => {});
  await sessionStore.clear();
}
