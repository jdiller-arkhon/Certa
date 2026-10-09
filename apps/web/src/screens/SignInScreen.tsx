'use client';

import type { SignInScreenProps } from '@certa/contract';
import { KeyRound, Mail, MailCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { EASE, Rise } from '@/components/motion';
import { Banner, Banners } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { AuthLayout } from './_auth-layout';

export function SignInScreen(props: SignInScreenProps) {
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState(props.initialEmail ?? '');
  const [password, setPassword] = useState('');

  return (
    <AuthLayout>
      <AnimatePresence mode="wait">
        {props.magicLinkSentTo ? (
          <motion.div key="sent" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} role="status">
            <motion.div
              initial={{ scale: 0.6, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              className="mb-8 flex size-16 items-center justify-center rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow)]"
            >
              <MailCheck className="size-7" aria-hidden />
            </motion.div>
            <h1 className="headline text-[34px] leading-tight">Check your email</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--certa-muted)]">
              If an account exists for <strong className="text-[var(--certa-text)]">{props.magicLinkSentTo}</strong>, a sign-in link is on its way. It expires in 15 minutes.
            </p>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }}>
            <Rise>
              <h1 className="headline text-[34px] leading-tight">Sign in to Certa</h1>
              <p className="mt-2 text-[15px] text-[var(--certa-muted)]">Welcome back. Your logbook is right where you left it.</p>
            </Rise>
            <Rise delay={0.08} className="mt-8">
              <Segmented
                label="Sign-in method"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'password', label: 'Password' },
                  { value: 'link', label: 'Email link' },
                ]}
              />
            </Rise>
            <Banners>{props.error && <Banner key="err" tone="error">{props.error}</Banner>}</Banners>
            <Rise delay={0.14}>
              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (mode === 'password') props.onSubmitPassword({ email, password });
                  else props.onRequestMagicLink({ email });
                }}
              >
                <Field label="Email">
                  {(a) => <Input {...a} name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />}
                </Field>
                <AnimatePresence initial={false}>
                  {mode === 'password' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
                      <Field label="Password">
                        {(a) => <Input {...a} name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
                      </Field>
                    </motion.div>
                  )}
                </AnimatePresence>
                <Button type="submit" size="lg" arrow loading={props.loading} className="w-full" icon={mode === 'password' ? <KeyRound className="size-4" aria-hidden /> : <Mail className="size-4" aria-hidden />}>
                  {mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}
                </Button>
              </form>
            </Rise>
            {props.ssoProviders.length > 0 && (
              <div className="mt-4 space-y-2">
                {props.ssoProviders.map((p) => (
                  <Button key={p.id} variant="secondary" size="lg" className="w-full" onClick={() => props.onSignInWithSso(p.id)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            )}
            <Rise delay={0.2}>
              <p className="mt-10 text-sm text-[var(--certa-muted)]">
                New to Certa?{' '}
                <button type="button" onClick={props.onGoToSignUp} className="font-semibold text-[var(--certa-text)] underline-offset-4 hover:underline">
                  Create an account
                </button>
              </p>
            </Rise>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
