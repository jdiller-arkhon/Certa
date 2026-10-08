import type { SignInScreenProps } from '@certa/contract';
import { useState } from 'react';
import { AsyncFrame } from './_placeholder';

export function SignInScreen(props: SignInScreenProps) {
  const [email, setEmail] = useState(props.initialEmail ?? '');
  const [password, setPassword] = useState('');
  if (props.magicLinkSentTo) return <p role="status">Check your email: we sent a sign-in link to {props.magicLinkSentTo}.</p>;
  return (
    <AsyncFrame state={props}>
      <h1>Sign in to Certa</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmitPassword({ email, password });
        }}
      >
        <label>
          Email <input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password <input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={props.loading}>Sign in</button>
        <button type="button" disabled={props.loading || !email} onClick={() => props.onRequestMagicLink({ email })}>
          Email me a sign-in link
        </button>
      </form>
      {props.ssoProviders.map((p) => (
        <button key={p.id} type="button" onClick={() => props.onSignInWithSso(p.id)}>
          {p.label}
        </button>
      ))}
      <button type="button" onClick={props.onGoToSignUp}>Create an account</button>
    </AsyncFrame>
  );
}
