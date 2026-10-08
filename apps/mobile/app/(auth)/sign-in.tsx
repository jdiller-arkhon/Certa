import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { requestMagicLink, signInWithPassword } from '@/lib/session';
import { SignInScreen } from '@/screens';

export default function SignIn() {
  const qc = useQueryClient();
  const [state, setState] = useState<{ loading: boolean; error: string | null; sentTo: string | null }>({ loading: false, error: null, sentTo: null });
  return (
    <SignInScreen
      loading={state.loading}
      error={state.error}
      initialEmail={null}
      magicLinkSentTo={state.sentTo}
      ssoProviders={[]}
      onSubmitPassword={async ({ email, password }) => {
        setState({ loading: true, error: null, sentTo: null });
        const ok = await signInWithPassword(email, password).catch(() => false);
        if (!ok) return setState({ loading: false, error: 'Sign-in failed. Check your email and password, and your connection.', sentTo: null });
        qc.removeQueries({ queryKey: ['me'] });
        router.replace('/(tabs)');
      }}
      onRequestMagicLink={async ({ email }) => {
        setState({ loading: true, error: null, sentTo: null });
        await requestMagicLink(email).catch(() => {});
        setState({ loading: false, error: null, sentTo: email });
      }}
      onSignInWithSso={() => {}}
      onGoToSignUp={() => {}}
    />
  );
}
