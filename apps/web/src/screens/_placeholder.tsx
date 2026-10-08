import type { AsyncState, DateDisplay, StatusBadge } from '@certa/contract';
import type { ReactNode } from 'react';

/** Shared bits for placeholders only. Real components replace all of this. */
export function AsyncFrame({ state, children }: { state: AsyncState; children: ReactNode }) {
  return (
    <>
      {state.loading && <p role="status">Loading…</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {children}
    </>
  );
}

export function Badge({ status }: { status: StatusBadge }) {
  const icon = status.level === 'green' ? '✓' : status.level === 'amber' ? '△' : '!';
  return (
    <span data-level={status.level}>
      <span aria-hidden="true">{icon}</span> {status.label}
    </span>
  );
}

export const when = (d: DateDisplay | null) => (d ? d.display : '—');
