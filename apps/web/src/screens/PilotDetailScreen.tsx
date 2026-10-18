'use client';

import type { PilotDetailScreenProps } from '@certa/contract';
import { BadgeCheck, FileDown, History, Pencil, Plus, Route } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { Panel, PanelRow, StatStrip } from '@/components/ui/panel';
import { LEVEL_COLOR, StatusBadge } from '@/components/ui/status';
import { TabPanel, Tabs, useHashTab } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/text';
import { PriorExperienceDialog } from './_prior';
import { ShareButton, ShareDialog } from './_share';
import { FlightRows, ListCard, Reasons, RowButton, RowTitle, When } from './_parts';

const TABS = ['overview', 'credentials', 'experience', 'flights'] as const;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function PilotDetailScreen(props: PilotDetailScreenProps) {
  const [tab, setTab] = useHashTab(TABS);
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [prior, setPrior] = useState<'new' | string | null>(null);
  const priorEntry = props.priorExperience.find((x) => x.id === prior);
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
            <ShareButton share={props.share} onOpen={() => setSharing(true)} />
            <Button variant="secondary" icon={<FileDown className="size-4" aria-hidden />} onClick={props.onExportLogbook}>Logbook</Button>
            {props.canEdit && <Button variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={props.onEditPilot}>Edit</Button>}
          </>
        }
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      <Tabs label="Pilot sections" tabs={[{ id: 'overview', label: 'Overview' }, { id: 'credentials', label: 'Credentials', count: props.credentials.length }, { id: 'experience', label: 'Prior experience', count: props.priorExperience.length }, { id: 'flights', label: 'Flights', count: p.logged.flights }]} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <TabPanel key="overview" label="Overview" className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel label="Readiness" meta={<StatusBadge status={p.status} size="sm" />}>
            <StatStrip
              items={[
                { label: 'Flights', value: p.totals.flights },
                { label: 'Missions', value: p.totals.missions },
                { label: 'Flight time', value: p.totals.flightTime.display },
                { label: 'Last 90 days', value: p.totals.last90DaysFlights },
              ]}
            />
            {p.prior && (
              <p className="border-b border-[var(--certa-border)] px-5 py-2.5 text-[13px] text-[var(--certa-muted)]">
                Includes {p.prior.flights} flights, {p.prior.missions} missions and {p.prior.flightTime.display} from other apps.{' '}
                <button type="button" onClick={() => setTab('experience')} className="underline underline-offset-2 hover:text-[var(--certa-text)]">Details</button>
              </p>
            )}
            <div className="px-5 py-4">
              {p.reasons.length ? <Reasons reasons={p.reasons} onOpen={props.canEdit ? () => setTab('credentials') : undefined} /> : <p className="text-[15px] text-[var(--certa-muted)]">Certificate and recurrent training are current. Legal to fly under the active rule pack.</p>}
            </div>
          </Panel>
          <div className="space-y-6">
            <Panel label="Contact">
              <div className="py-1.5">
                <PanelRow label="Certificate" value={p.certificateNumber ?? '—'} />
                <PanelRow label="Email" value={p.email ?? '—'} />
                <PanelRow label="Phone" value={p.phone ?? '—'} />
              </div>
            </Panel>
            <Panel label="Credentials" meta={<button type="button" onClick={() => setTab('credentials')} className="hover:text-[var(--certa-text)]">View all</button>}>
              <div className="py-1.5">
                {props.credentials.length ? (
                  props.credentials.slice(0, 4).map((c) => <PanelRow key={c.id} dot={LEVEL_COLOR[c.status.level]} label={c.typeLabel} value={c.expires ? c.expires.display : 'No expiry'} onClick={() => setTab('credentials')} />)
                ) : (
                  <p className="px-5 py-3 text-[14px] text-[var(--certa-muted)]">None on file yet.</p>
                )}
              </div>
            </Panel>
          </div>
        </TabPanel>
      )}

      {tab === 'credentials' && (
        <TabPanel key="credentials" label="Credentials">
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
        </TabPanel>
      )}

      {tab === 'experience' && (
        <TabPanel key="experience" label="Prior experience">
          <ListCard
            title="From other apps"
            count={props.priorExperience.length}
            aside={props.canEdit && <Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setPrior('new')}>Add</Button>}
          >
            {props.priorExperience.length ? (
              props.priorExperience.map((x) => (
                <RowButton key={x.id} onClick={props.canEdit ? () => setPrior(x.id) : undefined} label={`Edit ${x.source}`}>
                  <RowTitle
                    title={x.source}
                    sub={
                      <>
                        <span className="tabular">{x.flights} flights · {x.missions} missions · {x.flightTime.display}</span> · as of <When d={x.asOf} />
                        {x.notes && <> · {x.notes}</>}
                      </>
                    }
                  />
                </RowButton>
              ))
            ) : (
              <li className="flex flex-col items-center gap-2 px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]">
                <History className="size-5" aria-hidden />
                Flying before Certa? Add the flights, missions and flight time from each app you used (DJI Fly, AirData, DroneLogbook…). They count toward all-time totals.
              </li>
            )}
          </ListCard>
          {p.prior && (
            <p className="mt-3 px-1 text-[13px] text-[var(--certa-muted)]">
              All time: <span className="tabular">{p.totals.flights}</span> flights and {p.totals.flightTime.display} — {p.logged.flights} flights ({p.logged.flightTime.display}) logged in Certa plus {p.prior.flights} ({p.prior.flightTime.display}) from other apps.
            </p>
          )}
        </TabPanel>
      )}

      {tab === 'flights' && (
        <TabPanel key="flights" label="Flights">
          <ListCard title="Recent flights" count={props.recentFlights.length}>
            {props.recentFlights.length ? (
              <FlightRows flights={props.recentFlights} onOpen={props.onOpenFlight} showPilot={false} />
            ) : (
              <li className="flex flex-col items-center gap-2 px-5 py-8 text-center text-[14px] text-[var(--certa-muted)]">
                <Route className="size-5" aria-hidden /> No flights logged yet.
              </li>
            )}
          </ListCard>
        </TabPanel>
      )}

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
      <PriorExperienceDialog
        open={prior !== null}
        entry={priorEntry}
        onClose={() => setPrior(null)}
        onSave={(v) => {
          if (priorEntry) props.onUpdatePriorExperience({ ...v, priorId: priorEntry.id });
          else props.onAddPriorExperience(v);
          setPrior(null);
        }}
        onRemove={priorEntry ? () => (props.onRemovePriorExperience(priorEntry.id), setPrior(null)) : undefined}
      />
      <ShareDialog open={sharing} onClose={() => setSharing(false)} subject={p.name} share={props.share} onCreate={props.onCreateShareLink} onRevoke={props.onRevokeShareLink} />
    </div>
  );
}
