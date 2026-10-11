'use client';

import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/text';

/** Flight-log import (DJI, Autel, Skydio parsers) is Phase 3; this keeps the button honest. */
export function ImportComingSoon() {
  const router = useRouter();
  return (
    <div>
      <PageHeader eyebrow="Logbook" title="Import flights" />
      <EmptyState
        empty={{ title: 'Log import is coming next', body: 'Importing flight-controller logs (DJI, Autel, Skydio) arrives in the next phase. Until then, log flights manually — it takes under 30 seconds.', actionLabel: 'Log a flight' }}
        icon={<Upload className="size-7" aria-hidden />}
        onAction={() => router.push('/flights/new')}
      />
    </div>
  );
}
