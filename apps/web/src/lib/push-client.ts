'use client';

import { unwrap } from '@certa/sdk';
import { api } from './api';

/**
 * Browser side of Web Push: subscribe this device with the server's VAPID key, or remove it.
 * Needs the service worker, so it works in the installed / production app, not `next dev`.
 */
export type PushAvailability = 'available' | 'unsupported' | 'unconfigured' | 'blocked';

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushState(): Promise<{ availability: PushAvailability; enabled: boolean; publicKey: string | null }> {
  const reg = await registration();
  if (!reg) return { availability: 'unsupported', enabled: false, publicKey: null };
  const { publicKey } = unwrap(await api.GET('/api/v1/push/config'));
  if (!publicKey) return { availability: 'unconfigured', enabled: false, publicKey: null };
  if (Notification.permission === 'denied') return { availability: 'blocked', enabled: false, publicKey };
  const sub = await reg.pushManager.getSubscription();
  return { availability: 'available', enabled: !!sub, publicKey };
}

export async function enablePush(orgId: string): Promise<PushAvailability> {
  const reg = await registration();
  if (!reg) return 'unsupported';
  const { publicKey } = unwrap(await api.GET('/api/v1/push/config'));
  if (!publicKey) return 'unconfigured';
  if ((await Notification.requestPermission()) !== 'granted') return 'blocked';
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const r = await api.POST('/api/v1/orgs/{orgId}/push-subscriptions', { params: { path: { orgId } }, body: { endpoint: json.endpoint, keys: json.keys } });
  if (!r.response.ok) unwrap(r);
  return 'available';
}

export async function disablePush(orgId: string) {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.POST('/api/v1/orgs/{orgId}/push-subscriptions/remove', { params: { path: { orgId } }, body: { endpoint: sub.endpoint } });
  await sub.unsubscribe();
}

export async function testPush(orgId: string) {
  return unwrap(await api.POST('/api/v1/orgs/{orgId}/push-subscriptions/test', { params: { path: { orgId } } })).sent;
}
