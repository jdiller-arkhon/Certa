/**
 * Typed fixtures for building and previewing screens without a backend.
 *
 * Scenarios (each renders every Phase 1–2 screen for one coherent organization):
 * - solo       — one Part 107 pilot, two aircraft, everything current
 * - company    — 12 pilots / 9 aircraft, mixed green/amber/red; mobile offline with pending changes + 1 conflict
 * - expired    — everything expired, grounded aircraft, retired batteries
 * - empty      — brand-new org; every list is empty (use each screen's `empty` copy)
 * - longNames  — very long org, pilot, aircraft, and location names
 * - large      — 520 flights for list performance
 *
 * States: `states.*` shows how loading / error / partial (refetching stale data) / offline are
 * expressed through the same props. Components never infer state any other way.
 */
import type { AsyncState } from '../types.ts';
import { auth } from './auth.ts';
import { company } from './company.ts';
import { empty } from './empty.ts';
import { expired } from './expired.ts';
import { large } from './large.ts';
import { longNames } from './longNames.ts';
import type { FixtureScenario } from './scenario.ts';
import { solo } from './solo.ts';

export type { AuthFixtures, FixtureScenario } from './scenario.ts';
export { auth, company, empty, expired, large, longNames, solo };

export const scenarios: Record<string, FixtureScenario> = { solo, company, expired, empty, longNames, large };

/** Apply to any screen's data to produce a state variant. */
export const states = {
  /** First load: no data yet. Render skeletons; ignore data fields. */
  loading: { loading: true, error: null } satisfies AsyncState,
  /** Request failed and there is no data to show. */
  error: { loading: false, error: 'We couldn’t load this page. Check your connection and try again.' } satisfies AsyncState,
  /**
   * Partial: data is present AND a refresh is in flight. Show the data with a subtle progress
   * indicator — never blank the screen.
   */
  partial: { loading: true, error: null } satisfies AsyncState,
  /** Refresh failed but cached data exists: show the data plus a non-blocking error banner. */
  staleWithError: { loading: false, error: 'Showing saved data — the latest changes couldn’t be loaded.' } satisfies AsyncState,
} as const;

/** Mobile shells for the sync banner states. */
export const syncStates = {
  online: solo.mobileShell,
  offlineWithPending: company.mobileShell,
  syncing: {
    ...company.mobileShell,
    sync: { ...company.mobileShell.sync, status: 'syncing', message: 'Syncing 3 changes…', conflictCount: 0 },
  },
  error: {
    ...solo.mobileShell,
    sync: { ...solo.mobileShell.sync, status: 'error', message: 'Sync failed. Your changes are saved on this device and will retry.', pendingChanges: 1 },
  },
} satisfies Record<string, FixtureScenario['mobileShell']>;
