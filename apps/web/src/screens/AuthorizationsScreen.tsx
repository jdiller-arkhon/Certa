'use client';

import type { AuthorizationRowViewModel, AuthorizationsScreenProps } from '@certa/contract';
import { FileBadge, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { LEVEL_RANK, TextArea, When } from './_parts';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';

type Draft = Parameters<AuthorizationsScreenProps['onSave']>[0];

const KINDS: { value: Draft['kind']; label: string; hint: string }[] = [
  { value: 'laanc', label: 'LAANC approval', hint: 'The approval number from your LAANC app' },
  { value: 'airspace_authorization', label: 'Airspace authorization (DroneZone)', hint: 'FAA DroneZone reference' },
  { value: 'waiver', label: 'Part 107 waiver', hint: 'e.g. 107W-2026-01234' },
  { value: 'coa', label: 'Certificate of authorization (COA)', hint: 'COA number' },
  { value: 'other', label: 'Other', hint: 'Reference number' },
];

/** ISO instant → value for <input type="datetime-local"> in the device's zone, and back. */
const toLocal = (iso: string | undefined | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function EditDialog({ draft, props, onClose }: { draft: Draft; props: AuthorizationsScreenProps; onClose: () => void }) {
  const [d, setD] = useState({ ...draft, validFrom: toLocal(draft.validFrom), validTo: toLocal(draft.validTo) });
  const kind = KINDS.find((k) => k.value === d.kind)!;
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <Dialog
      open
      onClose={onClose}
      title={draft.id ? `Edit ${draft.reference}` : 'Add authorization'}
      description="Recorded here, it can be attached to flights and shows in inspector packets. Certa doesn’t request authorizations from the FAA."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="auth-form" loading={props.saving}>Save</Button>
        </>
      }
    >
      <form
        id="auth-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!d.reference.trim()) return;
          props.onSave({ ...d, reference: d.reference.trim(), title: d.title?.trim() || null, scope: d.scope?.trim() || null, conditions: d.conditions?.trim() || null, validFrom: fromLocal(d.validFrom), validTo: fromLocal(d.validTo), pilotId: props.ownPilotId ?? (d.pilotId || null) });
          onClose();
        }}
      >
        <Field label="Type">
          {(a) => (
            <Select {...a} value={d.kind} onChange={set('kind')}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference" hint={kind.hint} error={props.fieldErrors.reference}>{(a) => <Input {...a} required className="tabular" value={d.reference} onChange={set('reference')} />}</Field>
          <Field label="Title" hint="Optional">{(a) => <Input {...a} value={d.title ?? ''} onChange={set('title')} />}</Field>
        </div>
        {!props.ownPilotId && (
          <Field label="Issued to" hint="Leave as organization for waivers that cover every pilot">
            {(a) => (
              <Select {...a} value={d.pilotId ?? ''} onChange={set('pilotId')}>
                <option value="">Organization</option>
                {props.pilotOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            )}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valid from" hint="Optional">{(a) => <Input {...a} type="datetime-local" value={d.validFrom} onChange={set('validFrom')} />}</Field>
          <Field label="Valid until" hint="Optional" error={props.fieldErrors.validTo}>{(a) => <Input {...a} type="datetime-local" min={d.validFrom || undefined} value={d.validTo} onChange={set('validTo')} />}</Field>
        </div>
        <Field label="Scope" hint="Optional — area, altitude, operations covered">{(a) => <TextArea {...a} value={d.scope ?? ''} onChange={set('scope')} />}</Field>
        <Field label="Conditions" hint="Optional — special provisions to brief before flight">{(a) => <TextArea {...a} value={d.conditions ?? ''} onChange={set('conditions')} />}</Field>
      </form>
    </Dialog>
  );
}

export function AuthorizationsScreen(props: AuthorizationsScreenProps) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AuthorizationRowViewModel | null>(null);
  const blank = (): Draft => ({ id: null, kind: 'laanc', reference: '', title: null, pilotId: props.ownPilotId, validFrom: new Date().toISOString(), validTo: null, scope: null, conditions: null });
  const edit = (a: AuthorizationRowViewModel): Draft => ({ id: a.id, kind: a.kind, reference: a.reference, title: a.title, pilotId: a.pilot?.id ?? null, validFrom: a.validFrom?.iso ?? null, validTo: a.validTo?.iso ?? null, scope: a.scope, conditions: a.conditions });

  return (
    <div>
      <PageHeader
        title="Authorizations"
        description="LAANC approvals, airspace authorizations, Part 107 waivers, and COAs. Attach them to flights so the record shows what each operation was flown under."
        actions={props.canCreate && <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing(blank())}>Add authorization</Button>}
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      {props.authorizations.length === 0 && !props.loading ? (
        <EmptyState empty={{ title: 'No authorizations yet', body: 'Record a LAANC approval or waiver when you get one, then pick it when you log the flight.', actionLabel: null }} icon={<FileBadge className="size-7" aria-hidden />} />
      ) : (
        <DataTable
          id="authorizations"
          label="Authorizations"
          rows={props.authorizations}
          rowKey={(a) => a.id}
          openLabel={(a) => `Edit ${a.reference}`}
          onOpen={(a) => a.canEdit && setEditing(edit(a))}
          columns={[
            { key: 'ref', header: 'Authorization', sort: (a) => a.reference, render: (a) => <span><span className="tabular block font-semibold">{a.reference}</span><span className="block text-[13px] text-[var(--certa-muted)]">{a.kindLabel}{a.title ? ` · ${a.title}` : ''}</span></span> },
            { key: 'pilot', header: 'Issued to', hideBelow: 'md', sort: (a) => a.pilot?.name ?? '', render: (a) => a.pilot?.name ?? <span className="text-[var(--certa-muted)]">Organization</span> },
            { key: 'until', header: 'Valid until', hideBelow: 'sm', sort: (a) => a.validTo?.iso ?? null, render: (a) => <When d={a.validTo} /> },
            { key: 'status', header: 'Status', sort: (a) => LEVEL_RANK[a.status.level], render: (a) => <StatusBadge status={a.status} size="sm" /> },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (a) =>
                a.canEdit && (
                  <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" aria-label={`Edit ${a.reference}`} icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(edit(a))} />
                    <Button size="sm" variant="ghost" aria-label={`Delete ${a.reference}`} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setDeleting(a)} />
                  </span>
                ),
            },
          ]}
        />
      )}
      {editing && <EditDialog draft={editing} props={props} onClose={() => setEditing(null)} />}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.reference ?? 'authorization'}?`}
        description="Flights that used it keep showing it in their record."
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
