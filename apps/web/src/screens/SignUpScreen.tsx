import type { SignUpScreenProps } from '@certa/contract';
import { useState } from 'react';
import { AsyncFrame } from './_placeholder';

export function SignUpScreen(props: SignUpScreenProps) {
  const [v, setV] = useState({ name: '', email: '', password: '', organizationName: '', timezone: props.defaultTimezone });
  const field = (k: keyof typeof v) => ({ name: k, value: v[k], onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });
  return (
    <AsyncFrame state={props}>
      <h1>Create your Certa account</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit(v);
        }}
      >
        <label>Your name <input required {...field('name')} /></label>
        <label>Email <input type="email" required {...field('email')} /></label>
        <label>
          Password <input type="password" required minLength={props.passwordMinLength} {...field('password')} />
        </label>
        <label>Organization name <input required {...field('organizationName')} /></label>
        <label>
          Time zone
          <select {...field('timezone')}>
            {props.timezoneOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={props.loading}>Create account</button>
      </form>
      <button type="button" onClick={props.onGoToSignIn}>I already have an account</button>
    </AsyncFrame>
  );
}
