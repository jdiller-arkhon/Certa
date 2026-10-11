'use client';

import type { api as apiTypes } from '@certa/core';
import { CertaApiError, unwrap } from '@certa/sdk';
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import { idb } from './idb';

/**
 * Offline flight outbox. Every flight is written here first with a client-generated id, then
 * posted; the API treats a repeated id as a no-op, so retries after a dropped connection can
 * never create duplicates. Items the server rejects stay here as conflicts for a human.
 */
export interface OutboxItem {
  id: string;
  orgId: string;
  /** Author; only their session posts it (a shared device may switch users). */
  userId: string;
  body: apiTypes.CreateFlightRequest & { id: string };
  createdAt: string;
  status: 'pending' | 'rejected';
  error: string | null;
}

let items: OutboxItem[] = [];
let loaded = false;
let flushing = false;
let lastError: string | null = null;
let lastSyncedAt: string | null = null;
let currentUser: string | null = null;
/** Called after each flight lands, whoever triggered the flush (set by useOutboxAutoFlush). */
let syncedListener: ((orgId: string) => void) | null = null;
const listeners = new Set<() => void>();
export interface OutboxState {
  items: OutboxItem[];
  flushing: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
  online: boolean;
}
let snapshot: OutboxState = { items: [], flushing, lastError, lastSyncedAt, online: true };

function emit() {
  snapshot = { items: mine(), flushing, lastError, lastSyncedAt, online: typeof navigator === 'undefined' ? true : navigator.onLine };
  for (const l of listeners) l();
}

/** The signed-in user; the outbox only shows and posts their items. */
export function setOutboxUser(userId: string | null) {
  currentUser = userId;
  emit();
}

const mine = () => items.filter((i) => i.userId === currentUser);

async function load() {
  if (loaded) return;
  loaded = true;
  items = (await idb.values<OutboxItem>('outbox')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  emit();
}

async function put(item: OutboxItem) {
  items = [...items.filter((i) => i.id !== item.id), item].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  emit();
  await idb.set('outbox', item.id, item);
}

async function remove(id: string) {
  items = items.filter((i) => i.id !== id);
  emit();
  await idb.del('outbox', id);
}

/** Network failure (offline, DNS, captive portal) vs. an answer from the server. */
const isNetworkError = (err: unknown) => !(err instanceof CertaApiError) || err.status >= 500 || err.status === 401;

export async function enqueueFlight(orgId: string, userId: string, body: OutboxItem['body']) {
  await load();
  await put({ id: body.id, orgId, userId, body, createdAt: new Date().toISOString(), status: 'pending', error: null });
  void flushOutbox();
}

/** Posts pending flights oldest-first; stops at the first network failure. Returns how many synced. */
export async function flushOutbox(onSynced: ((orgId: string) => void) | null = syncedListener): Promise<number> {
  await load();
  if (flushing) return 0;
  flushing = true;
  emit();
  let synced = 0;
  try {
    for (const item of mine().filter((i) => i.status === 'pending')) {
      try {
        unwrap(await api.POST('/api/v1/orgs/{orgId}/flights', { params: { path: { orgId: item.orgId } }, body: item.body }));
        await remove(item.id);
        synced += 1;
        onSynced?.(item.orgId);
      } catch (err) {
        if (isNetworkError(err)) {
          lastError = err instanceof CertaApiError ? err.message : 'No connection';
          break;
        }
        await put({ ...item, status: 'rejected', error: (err as CertaApiError).message });
      }
    }
    if (synced || !mine().some((i) => i.status === 'pending')) {
      lastError = null;
      lastSyncedAt = new Date().toISOString();
    }
  } finally {
    flushing = false;
    emit();
  }
  return synced;
}

export async function retryRejected(id: string) {
  const item = items.find((i) => i.id === id);
  if (item) await put({ ...item, status: 'pending', error: null });
  return flushOutbox();
}

export const discardOutboxItem = remove;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_SNAPSHOT: OutboxState = { items: [], flushing: false, lastError: null, lastSyncedAt: null, online: true };

/** Outbox state for the shell's sync indicator and for showing unsynced flights in lists. */
export function useOutbox() {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
}

/** Flushes on startup, when the browser comes back online, and every 60 s while items wait. */
export function useOutboxAutoFlush(onSynced: (orgId: string) => void) {
  useEffect(() => {
    syncedListener = onSynced;
    const flush = () => void flushOutbox(onSynced);
    const status = () => emit();
    flush();
    window.addEventListener('online', flush);
    window.addEventListener('online', status);
    window.addEventListener('offline', status);
    const timer = window.setInterval(() => {
      if (mine().some((i) => i.status === 'pending')) flush();
    }, 60_000);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('online', status);
      window.removeEventListener('offline', status);
      window.clearInterval(timer);
      if (syncedListener === onSynced) syncedListener = null;
    };
  }, [onSynced]);
}
