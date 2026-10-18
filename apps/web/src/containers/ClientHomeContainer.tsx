'use client';

import type { api } from '@certa/core';
import { useSignOut } from '@/data/session';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/text';

/**
 * Home for Arkhon clients (customers): they have an account but no Certa organization.
 * The read-only view of the pilots on their jobs builds on this page.
 */
export function ClientHomeContainer({ me, onSignedOut }: { me: api.MeResponse; onSignedOut: () => void }) {
  const signOut = useSignOut();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <PageHeader eyebrow="Certa" title={`Hi ${me.user.name.split(' ')[0]}`} description="Certa is the logbook and compliance record for the pilots who fly Arkhon jobs." />
      <Card className="mt-6 p-6 text-[15px] leading-relaxed">
        <p>As an Arkhon client you’ll see, read-only, whether the pilots on your jobs are cleared to fly: their FAA certificate, recurrent training, insurance and aircraft registration.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => window.location.assign('/dashboard')}>Back to Argus</Button>
          <Button variant="secondary" onClick={async () => (await signOut.mutateAsync(), onSignedOut())}>Sign out of Certa</Button>
        </div>
      </Card>
    </main>
  );
}
