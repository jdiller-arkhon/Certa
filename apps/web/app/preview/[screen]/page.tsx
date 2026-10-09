'use client';

import type { ThemeName } from '@certa/contract';
import { ChevronLeft, SlidersHorizontal, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { notFound, useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { writeTheme } from '@/lib/theme';
import { PreviewFrame, SCENARIOS, SCREENS, STATES, type Scenario, type State } from '@/preview/registry';

function Picker<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] font-semibold text-[var(--certa-muted)]">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="h-8 rounded-lg border border-[var(--certa-border)] bg-[var(--certa-surface)] px-2 text-[13px] text-[var(--certa-text)]">
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Inner() {
  const { screen: id } = useParams<{ screen: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const screen = SCREENS.find((s) => s.id === id);
  const [open, setOpen] = useState(false);
  const scenario = (params.get('scenario') as Scenario) ?? 'company';
  const state = (params.get('state') as State) ?? 'loaded';
  const theme = (params.get('theme') as ThemeName) ?? 'light';
  const field = params.get('field') === '1';
  const variant = params.get('variant') ?? screen?.variants?.[0] ?? null;
  const chrome = params.get('chrome') !== '0';
  useEffect(() => writeTheme(theme), [theme]);
  if (!screen) notFound();

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    p.set(k, v);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return (
    <>
      <PreviewFrame screen={screen} scenario={scenario} state={state} variant={variant} theme={theme} field={field} onTheme={(t) => set('theme', t)} />
      {chrome && (
        <div className="certa fixed top-3 right-3 z-[60] lg:top-4 lg:right-4" style={{ background: 'transparent' }}>
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.div key="panel" initial={{ opacity: 0, scale: 0.95, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="w-64 space-y-2.5 rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] p-3.5 shadow-[var(--certa-shadow-lg)]">
                <div className="flex items-center justify-between">
                  <Link href="/preview" className="inline-flex items-center gap-1 text-[13px] font-semibold"><ChevronLeft className="size-4" aria-hidden />All screens</Link>
                  <button type="button" aria-label="Close preview controls" onClick={() => setOpen(false)}><X className="size-4" /></button>
                </div>
                <div className="text-sm font-semibold">{screen.title}</div>
                {screen.variants ? (
                  <Picker label="Variant" value={variant ?? ''} options={screen.variants} onChange={(v) => set('variant', v)} />
                ) : (
                  <>
                    <Picker label="Scenario" value={scenario} options={SCENARIOS} onChange={(v) => set('scenario', v)} />
                    <Picker label="State" value={state} options={STATES} onChange={(v) => set('state', v)} />
                    <Picker label="Shell" value={field ? 'field (offline)' : 'online'} options={['online', 'field (offline)'] as const} onChange={(v) => set('field', v === 'online' ? '0' : '1')} />
                  </>
                )}
                <Picker label="Theme" value={theme} options={['light', 'dark', 'sunlight'] as const} onChange={(v) => set('theme', v)} />
              </motion.div>
            ) : (
              <motion.button key="pill" type="button" onClick={() => setOpen(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-2 rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3.5 py-2 text-[12px] font-semibold shadow-[var(--certa-shadow)]">
                <SlidersHorizontal className="size-3.5" aria-hidden /> Preview
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

export default function PreviewScreenPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
