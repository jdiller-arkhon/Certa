'use client';

import type { PilotDetailScreenProps } from '@certa/contract';
import { BadgeCheck, FileDown, Pencil, Plus, Route } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { FlightRows, ListCard, Reasons, RowButton, RowTitle, Section, Stat, StatGrid, When } from './_parts';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function PilotDetailScreen(props: PilotDetailScreenProps) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; identifier: string; issuedOn: string; expiresOn: string } | null>(null);
  const editingCred = props.credentials.find((c) => c.id === editing?.id);
  const openEdit = (id: string) => {
    const c = props.credentials.find((x) => x.id === id);
    if (!c) return;
    props.onEditCredential(id);
    setEditing({ id, identifier: c.identifier ?? '', issuedOn: c.issued?.iso.slice(0, 10) ?? '', expiresOn: c.expiryBasis.startsWith('Expiry date from') ? (c.expires?.iso.slice(0, 10) ?? '') : '' });
  };
  const [form, setForm] = useState({ credentialType: props.credentialTypeOptions[0]?.value ?? '', identifier: '', issuedOn: '', expiresOn: '' });
  const type = props.credentialTypeOptions.find((o) => o.value === form.credentialType);
  const p = props.pilot;

  if (props.loading && !p) return <Card className="p-6"><SkeletonRows rows={5} /></Card>;
  if (!p) return <EmptyState empty={{ title: 'Pilot not found', body: 'This pilot may have been removed, or you may not have access.', actionLabel: null }} icon={<BadgeCheck className="size-7" aria-hidden />} />;

  return (
    <div>
      <PageHeader
        eyebrow="Pilot"
        title={
          <span className="flex items-center gap-4">
            <Avatar user={{ name: p.name, initials: initials(p.name) }} size={52} />
            <span>{p.name}</span>
          </span>
        }
        description={[p.certificateNumber && `Certificate ${p.certificateNumber}`, p.email, p.phone].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Button variant="secondary" icon={<FileDown className="size-4" aria-hidden />} onClick={props.onExportLogbook}>Logbook</Button>
            {props.canEdit && <Button variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={props.onEditPilot}>Edit</Button>}
          </>
        }
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      <Card className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        <div className="shrink-0"><StatusBadge status={p.status} /></div>
        <div className="flex-1">{p.reasons.length ? <Reasons reasons={p.reasons} /> : <p className="text-[15px] text-[var(--certa-muted)]">Certificate and recurrent training are current. Legal to fly under the active rule pack.</p>}</div>
      </Card>

      <StatGrid>
        <Stat label="Flights" value={p.totals.flights} />
        <Stat label="Flight time" value={p.totals.flightTime.display} />
        <Stat label="Last 90 days" value={p.totals.last90DaysFlights} sub="flights" />
        <Stat label="Credentials" value={props.credentials.length} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <ListCard
          title="Credentials"
          count={props.credentials.length}
          aside={props.canEdit && <Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>Add</Button>}
        >
          {props.credentials.length ? (
            props.credentials.map((c) => (
              <RowButton key={c.id} onClick={props.canEdit ? () => openEdit(c.id) : undefined} label={`Edit ${c.typeLabel}`}>
                <RowTitle
                  title={c.typeLabel}
                  sub={
                    <>
                      {c.identifier && <span className="tabular">{c.identifier} · </span>}
                      {c.expires ? <>Expires <When d={c.expires} /></> : c.expiryBasis}
                    </>
                  }
                />
                <StatusBadge status={c.status} size="sm" />
              </RowButton>
            ))
          ) : (
            <li className="px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]">No credentials on file. Add the Part 107 certificate and recurrent training to compute currency.</li>
          )}
        </ListCard>

        <ListCard title="Recent flights" count={props.recentFlights.length}>
          {props.recentFlights.length ? (
            <FlightRows flights={props.recentFlights} onOpen={props.onOpenFlight} showPilot={false} />
          ) : (
            <li className="flex flex-col items-center gap-2 px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]">
              <Route className="size-5" aria-hidden /> No flights logged yet.
            </li>
          )}
        </ListCard>
      </div>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add credential"
        description={type?.expires ? 'Certa computes the expiry from the issue date using the active rule pack, unless you enter one.' : 'This credential does not expire.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" form="credential-form" arrow>Add credential</Button>
          </>
        }
      >
        <form
          id="credential-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onAddCredential({ credentialType: form.credentialType, identifier: form.identifier || null, issuedOn: form.issuedOn || null, expiresOn: form.expiresOn || null, file: null });
            setAdding(false);
            setForm({ ...form, identifier: '', issuedOn: '', expiresOn: '' });
          }}
        >
          <Field label="Type">
            {(a) => (
              <Select {...a} value={form.credentialType} onChange={(e) => setForm({ ...form, credentialType: e.target.value })}>
                {props.credentialTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Number / identifier" hint="Optional">{(a) => <Input {...a} className="tabular" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issued">{(a) => <Input {...a} type="date" required value={form.issuedOn} onChange={(e) => setForm({ ...form, issuedOn: e.target.value })} />}</Field>
            {type?.expires && <Field label="Expires" hint="Leave blank to compute">{(a) => <Input {...a} type="date" min={form.issuedOn || undefined} value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} />}</Field>}
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editingCred?.typeLabel ?? 'Credential'}
        description={editingCred?.expiryBasis}
        footer={
          <>
            <Button variant="danger" onClick={() => (editing && props.onRemoveCredential(editing.id), setEditing(null))}>Remove</Button>
            <span className="flex-1" />
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="credential-edit-form" arrow>Save</Button>
          </>
        }
      >
        {editing && (
          <form
            id="credential-edit-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              props.onUpdateCredential({ credentialId: editing.id, identifier: editing.identifier || null, issuedOn: editing.issuedOn || null, expiresOn: editing.expiresOn || null });
              setEditing(null);
            }}
          >
            <Field label="Number / identifier">{(a) => <Input {...a} className="tabular" value={editing.identifier} onChange={(e) => setEditing({ ...editing, identifier: e.target.value })} />}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issued">{(a) => <Input {...a} type="date" value={editing.issuedOn} onChange={(e) => setEditing({ ...editing, issuedOn: e.target.value })} />}</Field>
              <Field label="Expires" hint="Blank = computed">{(a) => <Input {...a} type="date" min={editing.issuedOn || undefined} value={editing.expiresOn} onChange={(e) => setEditing({ ...editing, expiresOn: e.target.value })} />}</Field>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
