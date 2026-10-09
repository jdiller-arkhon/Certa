import type { ReadinessLevel, StatusBadge as StatusBadgeVM } from '@certa/contract';
import { AlertTriangle, Check, OctagonAlert } from 'lucide-react';
import { cn } from '../cn';

export const LEVEL_COLOR: Record<ReadinessLevel, string> = {
  green: 'var(--certa-current)',
  amber: 'var(--certa-warning)',
  red: 'var(--certa-expired)',
};

export function LevelIcon({ level, className }: { level: ReadinessLevel; className?: string }) {
  const Icon = level === 'green' ? Check : level === 'amber' ? AlertTriangle : OctagonAlert;
  return <Icon aria-hidden className={cn('size-3.5 shrink-0', className)} strokeWidth={2.5} />;
}

/** Color + icon + text, never color alone. Red badges carry a soft live pulse. */
export function StatusBadge({ status, className, size = 'md' }: { status: StatusBadgeVM; className?: string; size?: 'sm' | 'md' }) {
  const color = LEVEL_COLOR[status.level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[12px]' : 'px-2.5 py-1 text-[13px]',
        className,
      )}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 7%, transparent)` }}
    >
      {status.level === 'red' ? (
        <span className="relative flex size-3.5 items-center justify-center">
          <span className="ping absolute size-2 rounded-full" style={{ background: color }} />
          <LevelIcon level="red" className="relative" />
        </span>
      ) : (
        <LevelIcon level={status.level} />
      )}
      {status.label}
    </span>
  );
}

export function LevelDot({ level }: { level: ReadinessLevel }) {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[level] }} />;
}
