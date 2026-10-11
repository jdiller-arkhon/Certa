/**
 * Web Push (VAPID). Off unless VAPID keys are configured. Payloads are small JSON objects the
 * service worker turns into notifications; push services only ever see encrypted bytes.
 */
import webpush from 'web-push';
import type { Config } from '../config.js';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** App-relative path to open, e.g. "/pilots/…". */
  url: string;
  tag?: string;
}

export type PushResult = 'sent' | 'gone' | 'failed';

export interface Pusher {
  publicKey: string;
  send(target: PushTarget, message: PushMessage): Promise<PushResult>;
}

export function createPusher(config: Config): Pusher | null {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return null;
  const subject = config.VAPID_SUBJECT ?? config.PUBLIC_URL;
  const details = { subject, publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY };
  return {
    publicKey: config.VAPID_PUBLIC_KEY,
    async send(t, m) {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify(m), { vapidDetails: details, TTL: 24 * 3600, urgency: 'normal', timeout: 8000 });
        return 'sent';
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the browser unsubscribed; the subscription should be deleted.
        return status === 404 || status === 410 ? 'gone' : 'failed';
      }
    },
  };
}

/**
 * Only the browsers' real push services are accepted, so a crafted "endpoint" can't make the
 * server send requests elsewhere (SSRF).
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function isPushEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
