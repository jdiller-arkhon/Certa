'use client';

import type { FlightDetailScreenProps } from '@certa/contract';
import { Fingerprint, Pencil, Route, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { GoNoGoPanel } from '@/components/go-no-go';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/text';
import { Facts, Section, Stat, StatGrid, When } from './_parts';

/** Flight track as a scaled polyline (no basemap, so it works offline). */
function TrackPlot({ path }: { path: unknown }) {
  const pts = useMemo(() => {
    const coords = (path as { coordinates?: number[][] } | null)?.coordinates ?? [];
    if (coords.length < 2) return null;
    const lat0 = coords[0]![1]!;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xy = coords.map(([lon, lat]) => [lon! * k, -lat!]);
    const xs = xy.map((p) => p[0]!);
    const ys = xy.map((p) => p[1]!);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const pad = 24;
    const size = 400 - pad * 2;
    return xy.map(([x, y]) => [pad + ((x! - minX) / span) * size + (size - ((maxX - minX) / span) * size) / 2, pad + ((y! - minY) / span) * size + (size - ((maxY - minY) / span) * size) / 2] as const);
  }, [path]);
  if (!pts) return null;
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [sx, sy] = pts[0]!;
  const [ex, ey] = pts.at(-1)!;
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label="Flight track" className="dot-grid aspect-square w-full rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-inset)]">
      <motion.path d={d} fill="none" stroke="var(--certa-text)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }} />
      <circle cx={sx} cy={sy} r={6} fill="var(--certa-current)" stroke="var(--certa-surface)" strokeWidth={2} />
      <circle cx={ex} cy={ey} r={6} fill="var(--certa-surface)" stroke="var(--certa-text)" strokeWidth={2.5} />
    </svg>
  );
}

function AltitudeProfile({ profile, unit }: { profile: { t: number; altitude: number }[]; unit: string }) {
  if (profile.length < 2) return null;
  const W = 600;
  const H = 160;
  const maxT = profile.at(-1)!.t || 1;
  const maxA = Math.max(...profile.map((p) => p.altitude), 1);
  const pts = profile.map((p) => [(p.t / maxT) * W, H - (p.altitude / maxA) * (H - 16)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Altitude profile, peak ${Math.round(maxA)} ${unit}`} className="h-40 w-full">
        <defs>
          <linearGradient id="alt-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--certa-text)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--certa-text)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#alt-fill)" />
        <motion.path d={line} fill="none" stroke="var(--certa-text)" strokeWidth={2} vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[12px] text-[var(--certa-muted)]">
        <span>Takeoff</span>
        <span className="tabular">Peak {Math.round(maxA)} {unit}</span>
        <span>Landing</span>
      </figcaption>
    </figure>
  );
}

export function FlightDetailScreen(props: FlightDetailScreenProps) {
  const [confirm, setConfirm] = useState(false);
  const f = props.flight;
  if (props.loading && !f) return <Card className="p-6"><SkeletonRows rows={5} /></Card>;
  if (!f) return <EmptyState empty={{ title: 'Flight not found', body: 'This flight may have been deleted, or you may not have access.', actionLabel: null }} icon={<Route className="size-7" aria-hidden />} />;

  return (
    <div>
      <PageHeader
        eyebrow={f.operationType}
        title={<When d={f.takeoff} />}
        description={[f.aircraft.name, f.locationName].filter(Boolean).join(' · ')}
        actions={
          props.canEdit && (
            <>
              <Button variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={props.onEdit}>Edit</Button>
              <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>Delete</Button>
            </>
          )
        }
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      <StatGrid>
        <Stat label="Duration" value={f.duration.display} />
        <Stat label="Max altitude" value={f.maxAltitude?.display ?? '—'} sub="AGL" />
        <Stat label="Max distance" value={f.maxDistance?.display ?? '—'} />
        <Stat label="Batteries" value={f.batteries.length} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Section title="Flight">
            <Facts
              items={[
                ['Pilot in command', <span className="inline-flex items-center gap-2"><Avatar user={f.pilot} size={24} />{f.pilot.name}</span>],
                ['Visual observers', f.observers.length ? f.observers.map((o) => o.name).join(', ') : null],
                ['Takeoff', f.takeoff.absolute],
                ['Landing', f.landing.absolute],
                ['Aircraft', f.aircraft.name],
                ['Location', f.locationName],
                ['Airspace', f.airspaceClass],
                ['Authorization', f.authorizationRef],
                ['Weather', f.weatherSummary],
                ['Source', f.source],
              ]}
            />
            {f.notes && <p className="mt-5 rounded-xl bg-[var(--certa-inset)] px-4 py-3 text-[14px] whitespace-pre-wrap">{f.notes}</p>}
          </Section>
          {props.altitudeProfile.length > 1 && (
            <Section title="Altitude">
              <AltitudeProfile profile={props.altitudeProfile} unit={f.maxAltitude?.unit ?? 'ft'} />
            </Section>
          )}
          {f.batteries.length > 0 && (
            <Section title="Batteries">
              <ul className="space-y-2">
                {f.batteries.map((b) => (
                  <li key={b.id} className="flex items-center justify-between text-[14px]">
                    <span className="font-semibold">{b.label}</span>
                    <span className="tabular text-[var(--certa-muted)]">{b.startPct != null && b.endPct != null ? `${b.startPct}% → ${b.endPct}%` : '—'}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <div className="space-y-6">
          {props.path != null && (
            <Section title="Track">
              <TrackPlot path={props.path} />
            </Section>
          )}
          {props.preflight && <GoNoGoPanel result={props.preflight} compact />}
          {f.integrity && (
            <Section title="Integrity" aside={<Fingerprint className="size-4 text-[var(--certa-muted)]" aria-hidden />}>
              <p className="text-[13px] text-[var(--certa-muted)]">
                {f.integrity.verified === true ? 'Verified: this record matches its sealed hash.' : f.integrity.verified === false ? 'Mismatch: this record changed after it was sealed.' : 'Sealed when recorded. Edits are kept in the audit log.'}
              </p>
              <code className="mt-2 block truncate rounded-lg bg-[var(--certa-inset)] px-3 py-2 text-[12px]">{f.integrity.contentHash}</code>
            </Section>
          )}
        </div>
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this flight?"
        description="Pilot and aircraft totals and battery cycles are recalculated. The deletion is kept in the audit log."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => (setConfirm(false), props.onDelete())}>Delete flight</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--certa-muted)]">{f.takeoff.absolute} · {f.duration.display}</p>
      </Dialog>
    </div>
  );
}
