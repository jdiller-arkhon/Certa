import type { UserChip } from '@certa/contract';
import { cn } from '../cn';

export function Avatar({ user, size = 36, className }: { user: Pick<UserChip, 'initials' | 'name'>; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      title={user.name}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--certa-border)] bg-[var(--certa-inset)] font-semibold text-[var(--certa-text)]', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {user.initials}
    </span>
  );
}
