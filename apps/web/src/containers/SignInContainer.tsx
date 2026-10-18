'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { keys } from '@/data/session';
import { api } from '@/lib/api';
import { withBase } from '@/lib/base-path';
import { SignInScreen } from '@/screens';

async function postAuth(path: string, body: object): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(withBase(`/api/auth/${path}`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: false, message: data.message };
}

/** Public: which sign-in methods this deployment offers. */
export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: async () => (await api.GET('/api/v1/auth/config')).data ?? { local: true, arkhon: null },
    staleTime: Infinity,
  });
}

function Inner() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const config = useAuthConfig();
  const arkhon = config.data?.arkhon ?? null;
  const [state, setState] = useState<{ loading: boolean; error: string | null; sentTo: string | null }>({ loading: false, error: null, sentTo: null });

  /** Turns the Arkhon session the browser already has into a Certa session. */
  const exchange = async (sendToArkhon: boolean) => {
    if (!arkhon) return;
    setState({ loading: true, error: null, sentTo: null });
    const res = await fetch(withBase('/api/auth/arkhon/exchange'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (res.ok) {
      qc.removeQueries({ queryKey: keys.me });
      return router.replace('/');
    }
    if (res.status === 401) {
      if (sendToArkhon) return window.location.assign(arkhon.loginUrl);
      return setState({ loading: false, error: params.get('arkhon') ? 'You’re not signed in to Arkhon yet. Sign in there, then come back.' : null, sentTo: null });
    }
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setState({ loading: false, error: data.message ?? 'Couldn’t sign you in. Try again in a moment.', sentTo: null });
  };

  // Already signed in to Arkhon (or just back from its sign-in page): sign straight in. Not right
  // after signing out of Certa, or the Arkhon session would sign them straight back in.
  const tried = useRef(false);
  useEffect(() => {
    if (!arkhon || tried.current || params.get('signedOut')) return;
    tried.current = true;
    void exchange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arkhon]);

  return (
    <SignInScreen
      loading={state.loading || config.isPending}
      error={state.error}
      initialEmail={params.get('email')}
      magicLinkSentTo={state.sentTo}
      localAuth={config.data?.local ?? true}
      ssoProviders={arkhon ? [{ id: 'arkhon', label: 'Continue with your Arkhon account' }] : []}
      onSubmitPassword={async ({ email, password }) => {
        setState({ loading: true, error: null, sentTo: null });
        const r = await postAuth('sign-in/email', { email, password });
        if (!r.ok) return setState({ loading: false, error: 'That email and password don’t match. Try again or use a sign-in link.', sentTo: null });
        qc.removeQueries({ queryKey: keys.me });
        router.replace('/');
      }}
      onRequestMagicLink={async ({ email }) => {
        setState({ loading: true, error: null, sentTo: null });
        const r = await postAuth('sign-in/magic-link', { email, callbackURL: withBase('/') });
        // Always confirm, so the form can't be used to probe which emails have accounts.
        setState({ loading: false, error: r.ok || r.message ? null : 'Could not send the link. Try again.', sentTo: email });
      }}
      onSignInWithSso={() => void exchange(true)}
      onGoToSignUp={() => (arkhon && config.data?.local === false ? window.location.assign(arkhon.signupUrl) : router.push('/sign-up'))}
    />
  );
}

export function SignInContainer() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
