'use client';

import type { ChecklistViewModel, FlightChecklistViewModel } from '@certa/contract';
import { Check, CircleAlert } from 'lucide-react';
import { cn } from './cn';
import { Panel } from './ui/panel';
import { LEVEL_COLOR } from './ui/status';

type Section = { id?: string; title: string; items: { id: string; text: string; required: boolean; checked?: boolean; note?: string | null }[] };

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150',
        on ? 'border-[var(--certa-action)] bg-[var(--certa-action)] text-[var(--certa-onAction)]' : 'border-[var(--certa-border)] bg-[var(--certa-surface)]',
      )}
    >
      {on && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

/** Required items ticked out of required items, for the progress line. */
function progress(sections: Section[], isOn: (id: string) => boolean) {
  const req = sections.flatMap((s) => s.items.filter((i) => i.required));
  const done = req.filter((i) => isOn(i.id)).length;
  return { done, total: req.length, complete: done === req.length };
}

/**
 * The pre-flight checklist as a pilot ticks it. Large tap targets, sections in order, and a
 * progress line that turns green when every required item is done. Incomplete is allowed:
 * the flight records it as such.
 */
export function ChecklistRunner({ checklist, ticked, onToggle }: { checklist: ChecklistViewModel; ticked: Set<string>; onToggle: (itemId: string) => void }) {
  const p = progress(checklist.sections, (id) => ticked.has(id));
  return (
    <Panel
      label={checklist.name}
      meta={
        <span className="tabular" style={{ color: p.complete ? LEVEL_COLOR.green : undefined }}>
          {p.done} of {p.total} required
        </span>
      }
    >
      <div className="h-1 bg-[var(--certa-inset)]" aria-hidden>
        <div className="h-full transition-[width] duration-300" style={{ width: `${p.total ? (p.done / p.total) * 100 : 100}%`, background: p.complete ? LEVEL_COLOR.green : 'var(--certa-action)' }} />
      </div>
      {checklist.sections.map((s) => (
        <fieldset key={s.id} className="border-b border-[var(--certa-border)] last:border-b-0">
          <legend className="sr-only">{s.title}</legend>
          <div aria-hidden className="px-5 pt-3.5 pb-1 text-[12px] font-semibold tracking-[0.08em] text-[var(--certa-muted)] uppercase">{s.title}</div>
          <ul className="pb-1.5">
            {s.items.map((i) => {
              const on = ticked.has(i.id);
              return (
                <li key={i.id}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 px-5 py-2 transition-colors hover:bg-[var(--certa-inset)]">
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(i.id)} />
                    <Tick on={on} />
                    <span className={cn('text-[14px] leading-snug', on && 'text-[var(--certa-muted)]')}>
                      {i.text}
                      {!i.required && <span className="ml-1.5 text-[12px] text-[var(--certa-muted)]">Optional</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </Panel>
  );
}

/** A checklist as recorded with a flight: read-only, unticked required items called out. */
export function ChecklistRecord({ checklist: c }: { checklist: FlightChecklistViewModel }) {
  return (
    <Panel
      label="Pre-flight checklist"
      meta={
        <span style={{ color: c.completed ? LEVEL_COLOR.green : LEVEL_COLOR.amber }}>{c.completed ? 'Complete' : 'Incomplete'}</span>
      }
    >
      <div className="border-b border-[var(--certa-border)] px-5 py-3 text-[13px] text-[var(--certa-muted)]">
        {c.name} v{c.version} · {c.summary}
        {c.signed && <> · signed {c.signed.display}</>}
      </div>
      {c.sections.map((s) => (
        <div key={s.title} className="border-b border-[var(--certa-border)] last:border-b-0">
          <div className="px-5 pt-3.5 pb-1 text-[12px] font-semibold tracking-[0.08em] text-[var(--certa-muted)] uppercase">{s.title}</div>
          <ul className="pb-1.5">
            {s.items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 px-5 py-1.5 text-[14px]">
                {i.checked ? (
                  <Tick on />
                ) : i.required ? (
                  <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" style={{ color: LEVEL_COLOR.amber }} />
                ) : (
                  <Tick on={false} />
                )}
                <span className={cn(!i.checked && i.required && 'font-medium')}>
                  <span className="sr-only">{i.checked ? 'Done: ' : i.required ? 'Not done, required: ' : 'Not done: '}</span>
                  {i.text}
                  {i.note && <span className="block text-[13px] text-[var(--certa-muted)]">{i.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Panel>
  );
}
