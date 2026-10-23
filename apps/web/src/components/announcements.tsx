'use client';

import { unwrap } from '@certa/sdk';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const KEY = 'certa.dismissedAnnouncements';

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Current Arkhon announcements for this person, dismissible per device. */
export function Announcements() {
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  useEffect(() => setDismissed(readDismissed()), []);
  const q = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => unwrap(await api.GET('/api/v1/announcements')),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!dismissed) return null;
  const shown = (q.data?.announcements ?? []).filter((a) => !dismissed.includes(a.id));
  if (!shown.length) return null;
  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  return (
    <div className="mb-6 space-y-3">
      {shown.map((a) => {
        const color = a.level === 'important' ? 'var(--certa-warning)' : 'var(--certa-info)';
        return (
          <aside
            key={a.id}
            aria-label="Announcement from Arkhon"
            className="flex items-start gap-3 rounded-2xl border px-4 py-3"
            style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 6%, var(--certa-surface))` }}
          >
            <Megaphone aria-hidden className="mt-0.5 size-4 shrink-0" style={{ color }} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">{a.title}</p>
              <p className="text-[14px] whitespace-pre-line text-[var(--certa-muted)]">{a.body}</p>
            </div>
            <button type="button" aria-label={`Dismiss “${a.title}”`} onClick={() => dismiss(a.id)} className="text-[var(--certa-muted)] hover:text-[var(--certa-text)]">
              <X className="size-4" />
            </button>
          </aside>
        );
      })}
    </div>
  );
}
