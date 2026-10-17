'use client';

import type { LogFlightScreenProps } from '@certa/contract';
import { CloudSun, LocateFixed } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { LEVEL_COLOR, LevelIcon } from './ui/status';
import { Label } from './ui/text';

const RANK = { green: 0, amber: 1, red: 2 } as const;

/** Airspace, TFR, weather and daylight advisories at a point, fetched on request. Advisory only. */
export function ConditionsPanel({
  conditions: c,
  onCheck,
  title = 'Conditions here',
  intro = 'Airspace, TFRs, restricted areas, weather, and daylight at your location, from FAA, NWS and NOAA data. Advisory only; saved with the flight.',
}: {
  conditions: LogFlightScreenProps['conditions'];
  onCheck: () => void;
  title?: string;
  intro?: string;
}) {
  const busy = c.status === 'locating' || c.status === 'loading';
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <Label>{title}</Label>
          {c.checkedAt && <div className="mt-0.5 text-[12px] text-[var(--certa-muted)]">Checked {c.checkedAt.relative}</div>}
        </div>
        <Button size="sm" variant="secondary" loading={busy} icon={c.status === 'ready' ? <CloudSun className="size-4" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />} onClick={onCheck}>
          {c.status === 'locating' ? 'Locating…' : c.status === 'loading' ? 'Checking…' : c.status === 'ready' ? 'Refresh' : 'Check'}
        </Button>
      </div>
      {c.status === 'idle' && <p className="px-5 pb-4 text-[13px] text-[var(--certa-muted)]">{intro}</p>}
      {c.error && (
        <p role="alert" className="px-5 pb-4 text-[13px] text-[var(--certa-expired)]">
          {c.error}
        </p>
      )}
      {c.status === 'ready' && (
        <ul aria-label="Conditions advisories" className="border-t border-[var(--certa-border)]">
          {c.weatherSummary && <li className="border-b border-[var(--certa-border)] px-5 py-2.5 text-[13px]">{c.weatherSummary}</li>}
          {[...c.advisories].sort((x, y) => RANK[y.level] - RANK[x.level]).map((a, i) => (
            <li key={i} className="flex items-start gap-2.5 border-b border-[var(--certa-border)] px-5 py-2.5 last:border-b-0">
              <span className="mt-[3px]" style={{ color: LEVEL_COLOR[a.level] }}>
                <LevelIcon level={a.level} />
              </span>
              <span className="min-w-0 text-[13px]">
                <span className="font-semibold">{a.title}</span>
                <span className="block break-words whitespace-pre-line text-[var(--certa-muted)]">{a.detail}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--certa-muted)]">
                  {a.source}
                  {a.href && (
                    <a href={a.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--certa-text)] underline-offset-4 hover:underline">
                      Open ↗
                    </a>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
