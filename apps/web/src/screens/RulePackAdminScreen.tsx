import type { RulePackAdminScreenProps, RuleRowViewModel } from '@certa/contract';
import { useState } from 'react';
import { AsyncFrame, when } from './_placeholder';

function OverrideEditor({ rule, onSave }: { rule: RuleRowViewModel; onSave: (value: unknown, reason: string) => void }) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        let parsed: unknown = value;
        try {
          parsed = JSON.parse(value);
        } catch {}
        onSave(parsed, reason);
      }}
    >
      <label>
        New value (SI, JSON) <input aria-label={`Override value for ${rule.id}`} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label>
        Reason <input aria-label={`Override reason for ${rule.id}`} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button type="submit">Save override</button>
    </form>
  );
}

export function RulePackAdminScreen(props: RulePackAdminScreenProps) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <AsyncFrame state={props}>
      <h1>Rule pack</h1>
      {props.pack && (
        <section data-testid="rule-pack-header">
          <h2>
            {props.pack.name} <small>{props.pack.jurisdiction} v{props.pack.version}</small>
          </h2>
          <p>{props.pack.authority} · effective {props.pack.effectiveFrom.absolute}</p>
          <p role="note" data-testid="unverified-count">
            {props.pack.unverifiedCount} of {props.pack.ruleCount} values pending verification.
          </p>
          <p>{props.pack.disclaimer}</p>
        </section>
      )}
      <label>
        Search{' '}
        <input value={props.filter.search} onChange={(e) => props.onFilterChange({ ...props.filter, search: e.target.value })} />
      </label>
      <label>
        <input type="checkbox" checked={props.filter.unverifiedOnly} onChange={(e) => props.onFilterChange({ ...props.filter, unverifiedOnly: e.target.checked })} />{' '}
        Unverified only
      </label>
      {props.rules.length === 0 ? (
        <p>{props.empty.title}: {props.empty.body}</p>
      ) : (
        <table data-testid="rules-table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Value</th>
              <th>Stated as</th>
              <th>Source</th>
              <th>Last verified</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.rules.map((r) => (
              <tr key={r.id} data-rule-id={r.id}>
                <td>
                  <strong>{r.title}</strong>
                  <br />
                  <code>{r.id}</code>
                  {r.needsVerification && <span> · Needs verification</span>}
                </td>
                <td>
                  {r.valueDisplay}
                  {r.override && (
                    <div>
                      <s>{r.packValueDisplay}</s> Override by {r.override.setBy ?? 'unknown'}, {r.override.setAt.absolute}: {r.override.reason}
                    </div>
                  )}
                </td>
                <td>{r.statedAs ?? '—'}</td>
                <td>{r.sourceUrl ? <a href={r.sourceUrl} rel="noreferrer" target="_blank">{r.sourceCitation}</a> : r.sourceCitation}</td>
                <td>{r.lastVerified ? when(r.lastVerified) : 'Not yet verified'}</td>
                <td>
                  {r.canOverride && (
                    <>
                      <button type="button" onClick={() => setEditing(editing === r.id ? null : r.id)}>Override</button>
                      {r.override && (
                        <button type="button" onClick={() => props.onClearOverride({ ruleId: r.id, reason: 'Restored pack value' })}>Clear</button>
                      )}
                      {editing === r.id && (
                        <OverrideEditor
                          rule={r}
                          onSave={(value, reason) => {
                            props.onSetOverride({ ruleId: r.id, value, reason });
                            setEditing(null);
                          }}
                        />
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Credential types</h2>
      <ul>
        {props.credentialTypes.map((c) => (
          <li key={c.id}>
            {c.label}: {c.validity}
            {c.requiredForCurrency ? ' (required for currency)' : ''}
          </li>
        ))}
      </ul>
    </AsyncFrame>
  );
}
