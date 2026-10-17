'use client';

import type { ChecklistsAdminScreenProps } from '@certa/contract';
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { PageHeader } from '@/components/ui/text';

type Template = ChecklistsAdminScreenProps['templates'][number];
type Draft = Parameters<ChecklistsAdminScreenProps['onSave']>[0];
type DraftSection = Draft['sections'][number];

const KINDS: { value: Draft['kind']; label: string }[] = [
  { value: 'preflight', label: 'Pre-flight' },
  { value: 'postflight', label: 'Post-flight' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'other', label: 'Other' },
];

/** A short, stable-enough id for a new item or section. Existing ids are kept as they are. */
const newKey = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

const blank = (): Draft => ({
  id: null,
  name: '',
  kind: 'preflight',
  isDefault: false,
  sections: [{ id: newKey('s'), title: 'Checks', items: [{ id: newKey('i'), text: '', required: true }] }],
});

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

function Editor({ draft, saving, onChange, onSave, onCancel }: { draft: Draft; saving: boolean; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void }) {
  const setSection = (si: number, s: DraftSection) => onChange({ ...draft, sections: draft.sections.map((x, i) => (i === si ? s : x)) });
  const valid = draft.name.trim() && draft.sections.length && draft.sections.every((s) => s.title.trim() && s.items.length && s.items.every((i) => i.text.trim()));
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave();
      }}
    >
      <Panel label={draft.id ? 'Edit checklist' : 'New checklist'} bodyClassName="grid gap-4 p-5 sm:grid-cols-[1fr_200px]">
        <Field label="Name">{(a) => <Input {...a} required value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />}</Field>
        <Field label="Kind">
          {(a) => (
            <Select {...a} value={draft.kind} onChange={(e) => onChange({ ...draft, kind: e.target.value as Draft['kind'] })}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2.5 text-[14px] sm:col-span-2">
          <input type="checkbox" className="size-4 accent-[var(--certa-action)]" checked={draft.isDefault} onChange={(e) => onChange({ ...draft, isDefault: e.target.checked })} />
          Default for {KINDS.find((k) => k.value === draft.kind)?.label.toLowerCase()} — pilots tick this one when they log a flight
        </label>
      </Panel>

      {draft.sections.map((s, si) => (
        <Panel
          key={s.id}
          label={`Section ${si + 1}`}
          meta={
            <span className="flex items-center gap-1">
              <button type="button" aria-label={`Move section ${si + 1} up`} disabled={si === 0} onClick={() => onChange({ ...draft, sections: move(draft.sections, si, si - 1) })} className="rounded-full p-1.5 hover:bg-[var(--certa-inset)] disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" aria-label={`Move section ${si + 1} down`} disabled={si === draft.sections.length - 1} onClick={() => onChange({ ...draft, sections: move(draft.sections, si, si + 1) })} className="rounded-full p-1.5 hover:bg-[var(--certa-inset)] disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
              <button type="button" aria-label={`Remove section ${si + 1}`} disabled={draft.sections.length === 1} onClick={() => onChange({ ...draft, sections: draft.sections.filter((_, i) => i !== si) })} className="rounded-full p-1.5 hover:bg-[var(--certa-inset)] disabled:opacity-30"><Trash2 className="size-4" aria-hidden /></button>
            </span>
          }
        >
          <div className="border-b border-[var(--certa-border)] p-5">
            <Field label="Section title">{(a) => <Input {...a} required value={s.title} onChange={(e) => setSection(si, { ...s, title: e.target.value })} />}</Field>
          </div>
          <ul>
            {s.items.map((it, ii) => (
              <li key={it.id} className="flex flex-col gap-2 border-b border-[var(--certa-border)] px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
                <Input aria-label={`Item ${ii + 1} in ${s.title || `section ${si + 1}`}`} required placeholder="What to check" className="h-11 flex-1" value={it.text} onChange={(e) => setSection(si, { ...s, items: s.items.map((x, i) => (i === ii ? { ...x, text: e.target.value } : x)) })} />
                <span className="flex items-center gap-1">
                  <label className="mr-2 flex items-center gap-2 text-[13px] whitespace-nowrap">
                    <input type="checkbox" className="size-4 accent-[var(--certa-action)]" checked={it.required} onChange={(e) => setSection(si, { ...s, items: s.items.map((x, i) => (i === ii ? { ...x, required: e.target.checked } : x)) })} />
                    Required
                  </label>
                  <button type="button" aria-label={`Move item ${ii + 1} up`} disabled={ii === 0} onClick={() => setSection(si, { ...s, items: move(s.items, ii, ii - 1) })} className="rounded-full p-1.5 hover:bg-[var(--certa-inset)] disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                  <button type="button" aria-label={`Move item ${ii + 1} down`} disabled={ii === s.items.length - 1} onClick={() => setSection(si, { ...s, items: move(s.items, ii, ii + 1) })} className="rounded-full p-1.5 hover:bg-[var(--certa-inset)] disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                  <button type="button" aria-label={`Remove item ${ii + 1}`} disabled={s.items.length === 1} onClick={() => setSection(si, { ...s, items: s.items.filter((_, i) => i !== ii) })} className="rounded-full p-1.5 hover:bg-[var(--certa-inset)] disabled:opacity-30"><X className="size-4" aria-hidden /></button>
                </span>
              </li>
            ))}
          </ul>
          <div className="px-5 py-3">
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden />} onClick={() => setSection(si, { ...s, items: [...s.items, { id: newKey('i'), text: '', required: true }] })}>Add item</Button>
          </div>
        </Panel>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange({ ...draft, sections: [...draft.sections, { id: newKey('s'), title: '', items: [{ id: newKey('i'), text: '', required: true }] }] })}>Add section</Button>
        <span className="flex-1" />
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={saving} disabled={!valid}>{draft.id ? 'Publish new version' : 'Create checklist'}</Button>
      </div>
      {draft.id && <p className="text-[13px] text-[var(--certa-muted)]">Flights already logged keep the version they were checked against.</p>}
    </form>
  );
}

export function ChecklistsAdminScreen(props: ChecklistsAdminScreenProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const edit = (t: Template) => setDraft({ id: t.id, name: t.name, kind: t.kind, isDefault: t.isDefault, sections: t.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) })) });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Checklists"
        description="What pilots tick before every flight. The default pre-flight list appears in Log flight and is signed into the flight record."
        actions={props.canManage && !draft && <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setDraft(blank())}>New checklist</Button>}
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      {draft ? (
        <Editor
          draft={draft}
          saving={props.saving}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => {
            props.onSave({ ...draft, name: draft.name.trim(), sections: draft.sections.map((s) => ({ ...s, title: s.title.trim(), items: s.items.map((i) => ({ ...i, text: i.text.trim() })) })) });
            setDraft(null);
          }}
        />
      ) : props.templates.length === 0 ? (
        <EmptyState empty={{ title: 'No checklists yet', body: 'Create one to have pilots tick it when they log a flight.', actionLabel: null }} icon={<ListChecks className="size-7" aria-hidden />} />
      ) : (
        <div className="space-y-6">
          {props.templates.map((t) => (
            <Panel
              key={t.id}
              label={t.kindLabel}
              meta={
                <>
                  {t.isDefault && <span className="rounded-full bg-[var(--certa-inset)] px-2 py-0.5 text-[var(--certa-text)]">Default</span>}
                  <span className="tabular">v{t.version}</span>
                </>
              }
            >
              <div className="flex flex-col gap-3 border-b border-[var(--certa-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-[17px] font-semibold">{t.name}</h2>
                  <p className="text-[13px] text-[var(--certa-muted)]">{t.summary} · updated {t.updated.display}</p>
                </div>
                {props.canManage && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={() => edit(t)} aria-label={`Edit ${t.name}`}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`} disabled={props.templates.length === 1} />
                  </div>
                )}
              </div>
              <div className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2">
                {t.sections.map((s) => (
                  <div key={s.id}>
                    <div className="mb-1.5 text-[12px] font-semibold tracking-[0.08em] text-[var(--certa-muted)] uppercase">{s.title}</div>
                    <ul className="space-y-1 text-[14px]">
                      {s.items.map((i) => (
                        <li key={i.id} className="flex gap-2">
                          <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: i.required ? 'var(--certa-text)' : 'var(--certa-border)' }} />
                          <span>
                            {i.text}
                            {!i.required && <span className="ml-1.5 text-[12px] text-[var(--certa-muted)]">Optional</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'checklist'}?`}
        description="Pilots stop seeing it. Flights already logged keep their signed copy."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => (deleting && props.onDelete(deleting.id), setDeleting(null))}>Delete</Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
