'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { keys } from '@/data/session';
import { withBase } from '@/lib/base-path';
import { SignInScreen } from '@/screens';

async function postAuth(path: string, body: object): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(withBase(`/api/auth/${path}`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: false, message: data.message };
}

function Inner() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [state, setState] = useState<{ loading: boolean; error: string | null; sentTo: string | null }>({ loading: false, error: null, sentTo: null });
  return (
    <SignInScreen
      loading={state.loading}
      error={state.error}
      initialEmail={params.get('email')}
      magicLinkSentTo={state.sentTo}
      ssoProviders={[]}
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
      onSignInWithSso={() => {}}
      onGoToSignUp={() => router.push('/sign-up')}
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
