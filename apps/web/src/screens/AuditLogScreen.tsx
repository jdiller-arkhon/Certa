import type { AuditLogScreenProps } from '@certa/contract';
import { AsyncFrame } from './_placeholder';

export function AuditLogScreen(props: AuditLogScreenProps) {
  return (
    <AsyncFrame state={props}>
      <h1>Audit log</h1>
      <select aria-label="Entity" value={props.filter.entity ?? ''} onChange={(e) => props.onFilterChange({ ...props.filter, entity: e.target.value || null })}>
        <option value="">All records</option>
        {props.entityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {props.events.length === 0 && !props.loading ? (
        <p>{props.empty.title}. {props.empty.body}</p>
      ) : (
        <ol data-testid="audit-events">
          {props.events.map((e) => (
            <li key={e.id}>
              {e.at.absolute} · <strong data-direct={!e.actor || undefined}>{e.actorLabel}</strong> {e.operation} {e.entityLabel}
              <ul>
                {e.changes.map((c) => (
                  <li key={c.field}>
                    {c.field}: {c.before ?? '∅'} → {c.after ?? '∅'}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {props.hasMore && <button type="button" onClick={props.onLoadMore}>Load more</button>}
    </AsyncFrame>
  );
}
