'use client';

import { FileUp, Link2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/components/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners } from '@/components/ui/feedback';
import { Select } from '@/components/ui/field';
import { LEVEL_COLOR, LevelIcon } from '@/components/ui/status';
import { Label, PageHeader } from '@/components/ui/text';

export interface ImportRow {
  key: string;
  fileName: string;
  status: 'reading' | 'ready' | 'error' | 'imported';
  error: string | null;
  source: string | null;
  /** e.g. "Oct 23, 2026 · 10:00 AM – 10:09 AM". */
  when: string | null;
  stats: { label: string; value: string }[];
  battery: { level: 'green' | 'amber' | 'red'; text: string } | null;
  events: number;
  warnings: string[];
  logAircraft: string | null;
  aircraftId: string;
  linkedBy: 'serial' | 'model' | null;
  pilotId: string;
  batteryId: string;
  include: boolean;
  duplicate: boolean;
}

export interface FlightImportScreenProps {
  rows: ImportRow[];
  formats: readonly { ext: string; label: string }[];
  aircraftOptions: { value: string; label: string }[];
  pilotOptions: { value: string; label: string }[];
  batteryOptions: { value: string; label: string }[];
  saving: boolean;
  done: number | null;
  onFiles: (files: File[]) => void;
  onChange: (key: string, patch: Partial<Pick<ImportRow, 'aircraftId' | 'pilotId' | 'batteryId' | 'include'>>) => void;
  onRemove: (key: string) => void;
  onImport: () => void;
  onViewFlights: () => void;
}

/** /flights/import: read flight logs on this device and add them to the logbook with their data. */
export function FlightImportScreen(props: FlightImportScreenProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const ready = props.rows.filter((r) => r.status === 'ready' && r.include && r.aircraftId && r.pilotId);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Logbook" title="Import flight logs" description="Add flights from your drone’s own logs: times, track, height, distance, speed and battery health come straight from the aircraft. Logs are read on this device." />
      <Banners>
        {props.done != null && (
          <Banner key="done" tone="info">
            {props.done} {props.done === 1 ? 'flight' : 'flights'} added to the logbook (saved on this device first, so it’s safe offline).{' '}
            <button type="button" className="font-semibold underline underline-offset-4" onClick={props.onViewFlights}>View flights</button>
          </Banner>
        )}
      </Banners>

      <div
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          props.onFiles([...e.dataTransfer.files]);
        }}
        className={cn('flex flex-col items-center rounded-[24px] border-2 border-dashed px-6 py-10 text-center transition-colors', over ? 'border-[var(--certa-current)] bg-[color-mix(in_srgb,var(--certa-current)_6%,transparent)]' : 'border-[var(--certa-border)]')}
      >
        <FileUp className="mb-3 size-8 text-[var(--certa-muted)]" aria-hidden />
        <p className="text-[16px] font-semibold">Drop flight logs here</p>
        <p className="mt-1 max-w-lg text-[13.5px] text-[var(--certa-muted)]">{props.formats.map((f) => f.ext).join(', ')} · several at once is fine</p>
        <Button className="mt-4" icon={<Upload className="size-4" aria-hidden />} onClick={() => input.current?.click()}>Choose files</Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={[...props.formats.map((f) => f.ext), '.txt'].join(',')}
          className="hidden"
          aria-label="Flight log files"
          onChange={(e) => {
            props.onFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <details className="mt-5 max-w-xl text-left text-[13px] text-[var(--certa-muted)]">
          <summary className="cursor-pointer text-center font-semibold text-[var(--certa-text)]">Where do I find my logs?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><span className="font-semibold text-[var(--certa-text)]">DJI, Autel, Skydio, Parrot:</span> sync the flight to AirData, open it, and use Export → CSV. DJI’s own .txt records need DJI log reading, coming next.</li>
            <li><span className="font-semibold text-[var(--certa-text)]">Litchi and most mission apps:</span> export the flight as CSV, GPX or KML.</li>
            <li><span className="font-semibold text-[var(--certa-text)]">ArduPilot:</span> the .BIN file from the flight controller’s SD card (or download it in Mission Planner).</li>
            <li><span className="font-semibold text-[var(--certa-text)]">PX4:</span> the .ulg file from the SD card or QGroundControl’s Log Download.</li>
          </ul>
        </details>
      </div>

      {props.rows.length > 0 && (
        <div className="mt-6 space-y-3">
          {props.rows.map((r) => (
            <Card key={r.key} className={cn('p-5', r.status === 'imported' && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">{r.fileName}</div>
                  <div className="text-[13px] text-[var(--certa-muted)]">
                    {r.status === 'reading' ? 'Reading…' : r.status === 'error' ? null : [r.source, r.when].filter(Boolean).join(' · ')}
                    {r.status === 'imported' && ' · imported'}
                  </div>
                </div>
                {r.status === 'ready' && (
                  <label className="flex shrink-0 items-center gap-2 text-[13.5px] font-semibold">
                    <input type="checkbox" checked={r.include} onChange={(e) => props.onChange(r.key, { include: e.target.checked })} className="size-4 accent-[var(--certa-action)]" />
                    Import
                  </label>
                )}
                {r.status === 'error' && <button type="button" className="text-[13px] font-semibold text-[var(--certa-muted)] hover:underline" onClick={() => props.onRemove(r.key)}>Remove</button>}
              </div>
              {r.status === 'error' && <p className="mt-2 text-[14px] text-[var(--certa-expired)]" role="alert">{r.error}</p>}
              {(r.status === 'ready' || r.status === 'imported') && (
                <>
                  {r.duplicate && <p className="mt-2 text-[13.5px] font-semibold" style={{ color: LEVEL_COLOR.amber }}>This flight looks like it’s already in the logbook.</p>}
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
                    {r.stats.map((s) => (
                      <div key={s.label}>
                        <dt className="text-[12px] text-[var(--certa-muted)]">{s.label}</dt>
                        <dd className="tabular text-[15px] font-semibold">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {r.battery && (
                    <p className="mt-2 flex items-center gap-1.5 text-[13.5px]">
                      <span style={{ color: LEVEL_COLOR[r.battery.level] }}><LevelIcon level={r.battery.level} /></span>
                      {r.battery.text}
                    </p>
                  )}
                  {(r.events > 0 || r.warnings.length > 0) && (
                    <p className="mt-1 text-[12.5px] text-[var(--certa-muted)]">
                      {[r.events ? `${r.events} warning${r.events === 1 ? '' : 's'} from the aircraft` : null, ...r.warnings].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {r.status === 'ready' && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className="text-[13px] font-medium">
                        <span className="mb-1 flex items-center gap-1.5">
                          Aircraft
                          {r.linkedBy && <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--certa-current)_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--certa-current)]"><Link2 className="size-3" aria-hidden />{r.linkedBy === 'serial' ? 'Linked by serial' : 'Matched by model'}</span>}
                        </span>
                        <Select aria-label={`Aircraft for ${r.fileName}`} value={r.aircraftId} onChange={(e) => props.onChange(r.key, { aircraftId: e.target.value })}>
                          <option value="">Choose aircraft</option>
                          {props.aircraftOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                        {!r.linkedBy && r.logAircraft && <span className="mt-1 block text-[12px] font-normal text-[var(--certa-muted)]">Log says: {r.logAircraft}. Add its serial to the aircraft to link future logs automatically.</span>}
                      </label>
                      <label className="text-[13px] font-medium">
                        <span className="mb-1 block">Pilot in command</span>
                        <Select aria-label={`Pilot for ${r.fileName}`} value={r.pilotId} onChange={(e) => props.onChange(r.key, { pilotId: e.target.value })}>
                          {props.pilotOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      </label>
                      <label className="text-[13px] font-medium">
                        <span className="mb-1 block">Battery</span>
                        <Select aria-label={`Battery for ${r.fileName}`} value={r.batteryId} onChange={(e) => props.onChange(r.key, { batteryId: e.target.value })}>
                          <option value="">None recorded</option>
                          {props.batteryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      </label>
                    </div>
                  )}
                </>
              )}
            </Card>
          ))}
          <div className="flex flex-col items-end gap-2 pt-2">
            <Button size="lg" arrow loading={props.saving} disabled={!ready.length} onClick={props.onImport}>
              {ready.length ? `Import ${ready.length} ${ready.length === 1 ? 'flight' : 'flights'}` : 'Import'}
            </Button>
            {props.rows.some((r) => r.status === 'ready' && r.include && !r.aircraftId) && <p className="text-[12.5px] text-[var(--certa-muted)]">Choose the aircraft for each log to import it.</p>}
          </div>
        </div>
      )}
      <div className="mt-8"><Label>Supported</Label><p className="mt-1 text-[13px] text-[var(--certa-muted)]">{props.formats.map((f) => f.label).join(' · ')}</p></div>
    </div>
  );
}
