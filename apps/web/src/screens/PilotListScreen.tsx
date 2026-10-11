'use client';

import type { PilotListScreenProps } from '@certa/contract';
import { UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { StatusBadge } from '@/components/ui/status';
import { PageHeader } from '@/components/ui/text';
import { ListCard, RowButton, RowMetric, RowTitle, SearchBox, Toolbar, When } from './_parts';

export function PilotListScreen(props: PilotListScreenProps) {
  const searching = props.search.trim().length > 0;
  return (
    <div>
      <PageHeader
        eyebrow="Fleet"
        title="Pilots"
        description="Certificates, recurrent training, and flight time for everyone who flies for you."
        actions={props.canManage && <Button arrow icon={<UserPlus className="size-4" aria-hidden />} onClick={props.onAddPilot}>Add pilot</Button>}
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>
      {props.loading && !props.pilots.length ? (
        <Card className="p-6"><SkeletonRows rows={4} /></Card>
      ) : !props.pilots.length && !searching ? (
        <EmptyState empty={props.empty} icon={<Users className="size-7" aria-hidden />} onAction={props.canManage ? props.onAddPilot : undefined} />
      ) : (
        <>
          <Toolbar>
            <SearchBox value={props.search} onChange={props.onSearch} label="Search pilots" placeholder="Name, certificate, email" />
          </Toolbar>
          {props.pilots.length ? (
            <ListCard>
              {props.pilots.map((p) => (
                <RowButton key={p.id} onClick={() => props.onOpenPilot(p.id)} label={`Open ${p.name}`}>
                  <RowTitle title={p.name} sub={p.certificateNumber ? `Certificate ${p.certificateNumber}` : 'No certificate on file'} />
                  <span className="flex items-center gap-6">
                    <RowMetric label="Flight time" value={p.totalFlightTime.display} />
                    <RowMetric label="Last flight" value={<When d={p.lastFlight} />} className="hidden md:flex" />
                    <StatusBadge status={p.status} size="sm" />
                  </span>
                </RowButton>
              ))}
            </ListCard>
          ) : (
            <p className="py-10 text-center text-[15px] text-[var(--certa-muted)]">No pilots match “{props.search}”.</p>
          )}
        </>
      )}
    </div>
  );
}
