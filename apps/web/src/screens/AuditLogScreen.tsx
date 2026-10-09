'use client';

import type { AuditLogScreenProps } from '@certa/contract';
import { ArrowRight, DatabaseZap, FilePlus2, FileX2, History, PencilLine } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE } from '@/components/motion';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/text';

const OP_ICON = { created: FilePlus2, updated: PencilLine, deleted: FileX2 };

const pretty = (field: string) => field.replace(/_/g, ' ');

export function AuditLogScreen(props: AuditLogScreenProps) {
  return (
    <div>
      <PageHeader
        eyebrow="Records"
        title="Audit log"
        description="Every change to your records — who, what, when, and the before and after values. This log is append-only: no one, including administrators, can edit or delete it."
        actions={
          <div className="w-56">
            <Select aria-label="Entity" value={props.filter.entity ?? ''} onChange={(e) => props.onFilterChange({ ...props.filter, entity: e.target.value || null })}>
              <option value="">All records</option>
              {props.entityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        }
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      {props.loading && props.events.length === 0 ? (
        <Card className="p-6"><SkeletonRows rows={6} /></Card>
      ) : props.events.length === 0 ? (
        <EmptyState empty={props.empty} icon={<History className="size-7" aria-hidden />} />
      ) : (
        <div className="relative">
          <motion.div
            aria-hidden
            className="absolute top-2 bottom-2 left-[19px] w-px origin-top bg-[var(--certa-border)]"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 1.2, ease: EASE }}
          />
          <ol data-testid="audit-events" className="space-y-4">
            {props.events.map((e, i) => {
              const direct = !e.actor;
              const Icon = direct ? DatabaseZap : OP_ICON[e.operation];
              return (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ duration: 0.5, ease: EASE, delay: Math.min(i, 8) * 0.04 }}
                  className="relative flex gap-4"
                >
                  <span
                    className="relative z-10 mt-1 flex size-10 shrink-0 items-center justify-center rounded-full border bg-[var(--certa-surface)]"
                    style={direct ? { borderColor: 'var(--certa-expired)', color: 'var(--certa-expired)' } : { borderColor: 'var(--certa-border)' }}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <Card className="min-w-0 flex-1 p-4" style={direct ? { borderColor: 'color-mix(in srgb, var(--certa-expired) 45%, var(--certa-border))' } : undefined}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      {e.actor && <Avatar user={e.actor} size={22} />}
                      <strong data-direct={direct || undefined} style={direct ? { color: 'var(--certa-expired)' } : undefined}>
                        {e.actorLabel}
                      </strong>
                      <span className="text-[var(--certa-muted)]">{e.operation}</span>
                      <span className="font-semibold">{e.entityLabel}</span>
                      <span className="tabular ml-auto text-[12px] text-[var(--certa-muted)]">{e.at.display}</span>
                    </div>
                    {direct && <p className="mt-1 text-[12px]" style={{ color: 'var(--certa-expired)' }}>Changed outside the app, directly in the database. Review this change.</p>}
                    {e.changes.length > 0 && (
                      <dl className="mt-3 grid gap-1.5 text-[13px]">
                        {e.changes.slice(0, 8).map((c) => (
                          <div key={c.field} className="grid grid-cols-[140px_1fr] items-baseline gap-3">
                            <dt className="truncate text-[var(--certa-muted)] capitalize">{pretty(c.field)}</dt>
                            <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                              {e.operation === 'updated' && (
                                <>
                                  <span className="max-w-[45%] truncate rounded-md bg-[color-mix(in_srgb,var(--certa-expired)_8%,transparent)] px-1.5 py-0.5 line-through decoration-[var(--certa-expired)]/50">{c.before ?? '∅'}</span>
                                  <ArrowRight className="size-3 shrink-0 text-[var(--certa-muted)]" aria-hidden />
                                </>
                              )}
                              <span className="min-w-0 truncate rounded-md bg-[color-mix(in_srgb,var(--certa-current)_8%,transparent)] px-1.5 py-0.5">{(e.operation === 'deleted' ? c.before : c.after) ?? '∅'}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </Card>
                </motion.li>
              );
            })}
          </ol>
          {props.hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" loading={props.loading} onClick={props.onLoadMore}>Load older changes</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
