'use client';

import { Copy, Link2, PlaneLanding, RadioTower, Satellite, Trash2, Upload, Wind } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/components/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners } from '@/components/ui/feedback';
import { Select } from '@/components/ui/field';
import { LEVEL_COLOR } from '@/components/ui/status';
import { Label, PageHeader } from '@/components/ui/text';

export interface LiveAircraftCard {
  id: string;
  name: string;
  pilot: string | null;
  mode: string;
  stale: boolean;
  updated: string;
  stats: { label: string; value: string }[];
  battery: { pct: number | null; level: 'green' | 'amber' | 'red'; packs: string[] } | null;
  extras: { icon: 'gps' | 'wind'; text: string }[];
  track: [number, number][];
}

export interface LiveScreenProps {
  djiEnabled: boolean;
  linkUrl: string;
  flying: LiveAircraftCard[];
  review: { id: string; title: string; when: string; aircraftId: string; pilotId: string }[];
  logged: { id: string; title: string; when: string; flightId: string }[];
  devices: { id: string; title: string; sub: string; kind: 'gateway' | 'aircraft'; canUnlink: boolean }[];
  aircraftOptions: { value: string; label: string }[];
  pilotOptions: { value: string; label: string }[];
  error: string | null;
  busy: string | null;
  onAssign: (id: string, aircraftId: string, pilotId: string) => void;
  onDiscard: (id: string) => void;
  onUnlink: (id: string) => void;
  onOpenFlight: (id: string) => void;
  onImport: () => void;
}

function MiniTrack({ points }: { points: [number, number][] }) {
  if (points.length < 2) return <div className="flex h-full items-center justify-center text-[12.5px] text-[var(--certa-muted)]">Waiting for GPS</div>;
  const k = Math.cos((points[0]![1] * Math.PI) / 180);
  const xy = points.map(([lon, lat]) => [lon * k, -lat] as const);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY) || 1e-5;
  const pts = xy.map(([x, y]) => [12 + ((x - minX) / span) * 176, 12 + ((y - minY) / span) * 176] as const);
  const [hx, hy] = pts[0]!;
  const [cx, cy] = pts.at(-1)!;
  return (
    <svg viewBox="0 0 200 200" className="dot-grid h-full w-full rounded-xl bg-[var(--certa-inset)]" role="img" aria-label="Live track">
      <path d={pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke="var(--certa-text)" strokeWidth={2} strokeLinejoin="round" />
      <circle cx={hx} cy={hy} r={4} fill="var(--certa-surface)" stroke="var(--certa-text)" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={9} className="ping" fill="var(--certa-current)" opacity={0.35} />
      <circle cx={cx} cy={cy} r={5} fill="var(--certa-current)" stroke="var(--certa-surface)" strokeWidth={2} />
    </svg>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--certa-border)] text-[13px] font-semibold" aria-hidden>{n}</span>
      <div><div className="text-[14.5px] font-semibold">{title}</div><div className="text-[13.5px] text-[var(--certa-muted)]">{children}</div></div>
    </li>
  );
}

/** /live: linked drones streaming their flights, flights waiting for review, and setup. */
export function LiveScreen(props: LiveScreenProps) {
  const [copied, setCopied] = useState(false);
  const [picks, setPicks] = useState<Record<string, { aircraftId: string; pilotId: string }>>({});
  return (
    <div>
      <PageHeader eyebrow="Flights" title="Live" description="Linked drones stream their flights here as they fly. When one lands, Certa logs the flight for you, with its track, height, distance and battery data." />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      <section aria-labelledby="live-air" className="mb-8">
        <h2 id="live-air" className="mb-3 flex items-center gap-2 text-[13px] font-semibold tracking-[0.12em] text-[var(--certa-muted)] uppercase">
          In the air <span className="tabular rounded-full bg-[var(--certa-inset)] px-2 py-0.5 text-[12px]">{props.flying.length}</span>
        </h2>
        {props.flying.length === 0 ? (
          <Card className="p-6 text-[14.5px] text-[var(--certa-muted)]">Nothing in the air right now. A linked drone appears here the moment it takes off.</Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {props.flying.map((a) => (
              <Card key={a.id} className="overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--certa-border)] px-5 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-[17px] font-semibold">{a.name}</div>
                    <div className="text-[13px] text-[var(--certa-muted)]">{[a.pilot, a.mode].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className={cn('inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-semibold', a.stale ? 'bg-[color-mix(in_srgb,var(--certa-warning)_14%,transparent)]' : 'bg-[color-mix(in_srgb,var(--certa-current)_12%,transparent)] text-[var(--certa-current)]')}>
                    <span className="relative flex size-2" aria-hidden>
                      {!a.stale && <span className="ping absolute inset-0 rounded-full bg-[var(--certa-current)]" />}
                      <span className={cn('relative size-2 rounded-full', a.stale ? 'bg-[var(--certa-warning)]' : 'bg-[var(--certa-current)]')} />
                    </span>
                    {a.stale ? `No signal · ${a.updated}` : `Live · ${a.updated}`}
                  </span>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_180px]">
                  <div>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {a.stats.map((s) => (
                        <div key={s.label}>
                          <dt className="text-[12px] text-[var(--certa-muted)]">{s.label}</dt>
                          <dd className="tabular text-[22px] leading-tight font-semibold">{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {a.battery && (
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-[12.5px]"><span className="text-[var(--certa-muted)]">Battery</span><span className="tabular font-semibold">{a.battery.pct != null ? `${a.battery.pct}%` : '—'}</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--certa-inset)]"><div className="h-full rounded-full" style={{ width: `${a.battery.pct ?? 0}%`, background: LEVEL_COLOR[a.battery.level] }} /></div>
                        {a.battery.packs.length > 0 && <div className="mt-1 text-[12px] text-[var(--certa-muted)]">{a.battery.packs.join(' · ')}</div>}
                      </div>
                    )}
                    {a.extras.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--certa-muted)]">
                        {a.extras.map((e) => <span key={e.text} className="inline-flex items-center gap-1">{e.icon === 'gps' ? <Satellite className="size-3.5" aria-hidden /> : <Wind className="size-3.5" aria-hidden />}{e.text}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="aspect-square sm:h-[180px]"><MiniTrack points={a.track} /></div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {props.review.length > 0 && (
        <section aria-labelledby="live-review" className="mb-8">
          <h2 id="live-review" className="mb-1 text-[13px] font-semibold tracking-[0.12em] text-[var(--certa-muted)] uppercase">Needs review</h2>
          <p className="mb-3 text-[13.5px] text-[var(--certa-muted)]">These flights came in from a drone or bridge Certa couldn’t match to a drone or pilot. Choose them to log the flight.</p>
          <Card className="divide-y divide-[var(--certa-border)] overflow-hidden">
            {props.review.map((r) => {
              const pick = picks[r.id] ?? { aircraftId: r.aircraftId, pilotId: r.pilotId };
              return (
                <div key={r.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_200px_200px_auto] lg:items-center">
                  <div><div className="font-semibold">{r.title}</div><div className="text-[13px] text-[var(--certa-muted)]">{r.when}</div></div>
                  <Select aria-label={`Drone for ${r.title}`} value={pick.aircraftId} onChange={(e) => setPicks((p) => ({ ...p, [r.id]: { ...pick, aircraftId: e.target.value } }))}>
                    <option value="">Choose drone</option>
                    {props.aircraftOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                  <Select aria-label={`Pilot for ${r.title}`} value={pick.pilotId} onChange={(e) => setPicks((p) => ({ ...p, [r.id]: { ...pick, pilotId: e.target.value } }))}>
                    <option value="">Choose pilot</option>
                    {props.pilotOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" loading={props.busy === r.id} disabled={!pick.aircraftId || !pick.pilotId} onClick={() => props.onAssign(r.id, pick.aircraftId, pick.pilotId)}>Log flight</Button>
                    <Button size="sm" variant="ghost" onClick={() => props.onDiscard(r.id)}>Discard</Button>
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {props.logged.length > 0 && (
        <section aria-labelledby="live-logged" className="mb-8">
          <h2 id="live-logged" className="mb-3 text-[13px] font-semibold tracking-[0.12em] text-[var(--certa-muted)] uppercase">Logged automatically this week</h2>
          <Card className="divide-y divide-[var(--certa-border)] overflow-hidden">
            {props.logged.map((l) => (
              <button key={l.id} type="button" onClick={() => props.onOpenFlight(l.flightId)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[var(--certa-inset)]">
                <PlaneLanding className="size-4 text-[var(--certa-muted)]" aria-hidden />
                <span className="flex-1 font-semibold">{l.title}</span>
                <span className="text-[13px] text-[var(--certa-muted)]">{l.when}</span>
              </button>
            ))}
          </Card>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Label>Link a DJI enterprise drone</Label>
          {props.djiEnabled ? (
            <>
              <p className="mt-1 mb-4 text-[13.5px] text-[var(--certa-muted)]">For drones flown with DJI Pilot 2 or a DJI Dock: Matrice 30/30T, 300/350 RTK, Mavic 3 Enterprise and Thermal, Matrice 3D and Matrice 4.</p>
              <ol className="space-y-3">
                <Step n={1} title="Open DJI Pilot 2 on the controller">Tap Cloud Service, then Open Platform.</Step>
                <Step n={2} title="Enter this address">
                  <span className="mt-1 flex items-center gap-2">
                    <code className="truncate rounded-lg bg-[var(--certa-inset)] px-2 py-1 text-[12.5px] text-[var(--certa-text)]">{props.linkUrl}</code>
                    <button type="button" aria-label="Copy address" className="rounded-full p-1.5 hover:bg-[var(--certa-inset)]" onClick={() => void navigator.clipboard?.writeText(props.linkUrl).then(() => setCopied(true))}><Copy className="size-4" /></button>
                    {copied && <span className="text-[12px] text-[var(--certa-current)]">Copied</span>}
                  </span>
                </Step>
                <Step n={3} title="Sign in and tap “Link this controller”">That’s it: every flight from then on streams here and is logged when the drone lands.</Step>
              </ol>
            </>
          ) : (
            <p className="mt-2 text-[13.5px] text-[var(--certa-muted)]">Live linking for DJI enterprise drones isn’t switched on for this Certa server yet. It needs Arkhon’s DJI developer registration; ask your Certa admin.</p>
          )}
        </Card>
        <Card className="p-5">
          <Label>Other drones</Label>
          <p className="mt-1 text-[13.5px] text-[var(--certa-muted)]">DJI consumer drones, Autel, Skydio, Parrot, ArduPilot and PX4: import the flight log after you land and get the same data (track, height, distance, battery health).</p>
          <Button className="mt-3" variant="secondary" size="sm" icon={<Upload className="size-4" aria-hidden />} onClick={props.onImport}>Import flight logs</Button>
          <p className="mt-3 text-[12.5px] text-[var(--certa-muted)]">Developers can stream from any autopilot with an API key that has the live:write scope (Admin → Integrations).</p>
        </Card>
      </div>

      {props.devices.length > 0 && (
        <section aria-labelledby="live-devices" className="mt-8">
          <h2 id="live-devices" className="mb-3 text-[13px] font-semibold tracking-[0.12em] text-[var(--certa-muted)] uppercase">Linked controllers and drones</h2>
          <Card className="divide-y divide-[var(--certa-border)] overflow-hidden">
            {props.devices.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                {d.kind === 'gateway' ? <RadioTower className="size-4 text-[var(--certa-muted)]" aria-hidden /> : <Link2 className="size-4 text-[var(--certa-muted)]" aria-hidden />}
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">{d.title}</div><div className="text-[12.5px] text-[var(--certa-muted)]">{d.sub}</div></div>
                {d.canUnlink && (
                  <button type="button" aria-label={`Unlink ${d.title}`} className="rounded-full p-1.5 text-[var(--certa-muted)] hover:bg-[var(--certa-inset)] hover:text-[var(--certa-expired)]" onClick={() => confirm(`Unlink ${d.title}? It stops streaming to Certa at once.`) && props.onUnlink(d.id)}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
