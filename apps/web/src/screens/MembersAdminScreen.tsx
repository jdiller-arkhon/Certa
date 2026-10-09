'use client';

import type { MembersAdminScreenProps, Role } from '@certa/contract';
import { Clock, UserPlus, UserMinus, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { EASE } from '@/components/motion';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Banners, EmptyState, SkeletonRows } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/text';

export function MembersAdminScreen(props: MembersAdminScreenProps) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'pilot' as Role, expiresAt: '' });
  const roleInfo = props.roleOptions.find((r) => r.value === invite.role);
  const onlySelf = props.members.length <= 1;
  const removingMember = props.members.find((m) => m.membershipId === removing);

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Members"
        description="Everyone with access to this organization, and what they can do. Every change here is recorded in the audit log."
        actions={
          props.canManage && (
            <Button arrow onClick={() => setOpen(true)} icon={<UserPlus className="size-4" aria-hidden />}>
              Invite
            </Button>
          )
        }
      />
      <Banners>{props.error && <Banner key="e" tone="error">{props.error}</Banner>}</Banners>

      {props.loading && props.members.length === 0 ? (
        <Card className="p-6"><SkeletonRows rows={4} /></Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <ul>
              <AnimatePresence initial={false}>
                {props.members.map((m, i) => (
                  <motion.li
                    key={m.membershipId}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.45, ease: EASE } }}
                    exit={{ opacity: 0, x: -24, transition: { duration: 0.25 } }}
                    className="flex flex-col gap-3 border-b border-[var(--certa-border)] px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar user={m.user} size={40} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {m.user.name}
                          {m.isSelf && <span className="ml-2 rounded-full bg-[var(--certa-inset)] px-2 py-0.5 text-[11px] font-semibold text-[var(--certa-muted)]">You</span>}
                        </div>
                        <div className="truncate text-[13px] text-[var(--certa-muted)]">
                          {m.email} · joined {m.joined.absolute}
                        </div>
                        {m.expires && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[12px]" style={{ color: 'var(--certa-warning)' }}>
                            <Clock className="size-3" aria-hidden /> Access until {m.expires.display}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:w-auto">
                      {props.canManage && !m.isSelf ? (
                        <>
                          <div className="w-48">
                            <Select aria-label={`Role for ${m.email}`} className="h-10 text-sm" value={m.role} onChange={(e) => props.onChangeRole({ membershipId: m.membershipId, role: e.target.value as Role })}>
                              {props.roleOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </Select>
                          </div>
                          <Button variant="ghost" size="sm" aria-label={`Remove ${m.user.name}`} onClick={() => setRemoving(m.membershipId)} icon={<UserMinus className="size-4" aria-hidden />} />
                        </>
                      ) : (
                        <span className="rounded-full border border-[var(--certa-border)] px-3 py-1 text-[13px] font-semibold">{m.roleLabel}</span>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Card>
          {onlySelf && props.canManage && (
            <div className="mt-6">
              <EmptyState empty={props.empty} icon={<Users className="size-7" aria-hidden />} onAction={() => setOpen(true)} />
            </div>
          )}
        </>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Invite someone"
        description="They’ll get an email with a sign-in link. No password needed to start."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="invite-form" arrow>Send invite</Button>
          </>
        }
      >
        <form
          id="invite-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onInvite({ ...invite, expiresAt: invite.expiresAt ? new Date(`${invite.expiresAt}T23:59:59`).toISOString() : null });
            setOpen(false);
            setInvite({ email: '', name: '', role: 'pilot', expiresAt: '' });
          }}
        >
          <Field label="Name">{(a) => <Input {...a} required value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />}</Field>
          <Field label="Email">{(a) => <Input {...a} type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />}</Field>
          <Field label="Role" hint={roleInfo?.description}>
            {(a) => (
              <Select {...a} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
                {props.roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <AnimatePresence initial={false}>
            {invite.role === 'auditor' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <Field label="Access expires" hint="Auditor access is always time-boxed. Every view is logged.">
                  {(a) => <Input {...a} type="date" required value={invite.expiresAt} onChange={(e) => setInvite({ ...invite, expiresAt: e.target.value })} />}
                </Field>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </Dialog>

      <Dialog
        open={!!removingMember}
        onClose={() => setRemoving(null)}
        title={`Remove ${removingMember?.user.name ?? ''}?`}
        description="They lose access immediately. Their flights and records stay in your logbook."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => (removing && props.onRemove(removing), setRemoving(null))}>Remove access</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--certa-muted)]">This is recorded in the audit log.</p>
      </Dialog>
    </div>
  );
}
