'use client';

import { CertaApiError, unwrap } from '@certa/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { keys } from '@/data/session';
import { SignUpScreen } from '@/screens';
import { useAuthConfig } from './SignInContainer';

const COMMON_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];

export function SignUpContainer() {
  const router = useRouter();
  const qc = useQueryClient();
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const zones = [browserZone, ...COMMON_ZONES.filter((z) => z !== browserZone)];
  // Accounts come from Arkhon when Certa's own sign-up is off: send people there instead.
  const config = useAuthConfig();
  const arkhonOnly = config.data?.local === false;
  useEffect(() => {
    if (!arkhonOnly) return;
    if (config.data?.arkhon) window.location.assign(config.data.arkhon.signupUrl);
    else router.replace('/sign-in');
  }, [arkhonOnly, config.data, router]);
  if (arkhonOnly) return null;
  return (
    <SignUpScreen
      {...state}
      timezoneOptions={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))}
      defaultTimezone={browserZone}
      passwordMinLength={12}
      onSubmit={async (body) => {
        setState({ loading: true, error: null });
        try {
          unwrap(await api.POST('/api/v1/signup', { body }));
          qc.removeQueries({ queryKey: keys.me });
          router.replace('/');
        } catch (err) {
          setState({ loading: false, error: err instanceof CertaApiError ? err.message : 'Sign-up failed. Try again.' });
        }
      }}
      onGoToSignIn={() => router.push('/sign-in')}
    />
  );
}
