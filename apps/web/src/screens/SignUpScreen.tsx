'use client';

import type { SignUpScreenProps } from '@certa/contract';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Rise } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { Banner, Banners } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { AuthLayout } from './_auth-layout';

function strength(pw: string, min: number): number {
  if (!pw) return 0;
  let s = pw.length >= min ? 2 : 1;
  if (pw.length >= min + 4) s++;
  if (/[^a-z0-9]/i.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw))) s++;
  return Math.min(s, 4);
}

export function SignUpScreen(props: SignUpScreenProps) {
  const [v, setV] = useState({ name: '', email: '', password: '', organizationName: '', timezone: props.defaultTimezone });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const s = strength(v.password, props.passwordMinLength);
  const tooShort = v.password.length > 0 && v.password.length < props.passwordMinLength;
  return (
    <AuthLayout>
      <Rise>
        <h1 className="headline text-[34px] leading-tight">Create your Certa account</h1>
        <p className="mt-2 text-[15px] text-[var(--certa-muted)]">Set up your organization in under a minute. You can invite your team after.</p>
      </Rise>
      <Banners>{props.error && <Banner key="err" tone="error">{props.error}</Banner>}</Banners>
      <Rise delay={0.1}>
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit(v);
          }}
        >
          <Field label="Your name">{(a) => <Input {...a} required autoComplete="name" value={v.name} onChange={set('name')} />}</Field>
          <Field label="Email">{(a) => <Input {...a} type="email" required autoComplete="email" value={v.email} onChange={set('email')} />}</Field>
          <Field label="Password" hint={`At least ${props.passwordMinLength} characters.`} error={tooShort ? `Use at least ${props.passwordMinLength} characters.` : null}>
            {(a) => (
              <div className="space-y-2">
                <Input {...a} type="password" required minLength={props.passwordMinLength} autoComplete="new-password" value={v.password} onChange={set('password')} />
                <div className="flex gap-1.5" aria-hidden>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--certa-inset)]">
                      <motion.div className="h-full rounded-full" initial={false} animate={{ width: s >= i ? '100%' : '0%', background: s >= 3 ? 'var(--certa-current)' : s === 2 ? 'var(--certa-warning)' : 'var(--certa-expired)' }} transition={{ duration: 0.35 }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Field>
          <Field label="Organization name" hint="Your company or program. Shown on exported records.">
            {(a) => <Input {...a} required autoComplete="organization" value={v.organizationName} onChange={set('organizationName')} />}
          </Field>
          <Field label="Time zone">
            {(a) => (
              <Select {...a} value={v.timezone} onChange={set('timezone')}>
                {props.timezoneOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button type="submit" size="lg" arrow loading={props.loading} className="w-full">
            Create account
          </Button>
        </form>
      </Rise>
      <p className="mt-8 text-sm text-[var(--certa-muted)]">
        Already have an account?{' '}
        <button type="button" onClick={props.onGoToSignIn} className="font-semibold text-[var(--certa-text)] underline-offset-4 hover:underline">
          Sign in
        </button>
      </p>
    </AuthLayout>
  );
}
