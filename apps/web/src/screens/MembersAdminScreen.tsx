import type { MembersAdminScreenProps, Role } from '@certa/contract';
import { useState } from 'react';
import { AsyncFrame, when } from './_placeholder';

export function MembersAdminScreen(props: MembersAdminScreenProps) {
  const [invite, setInvite] = useState({ email: '', name: '', role: 'pilot' as Role, expiresAt: '' });
  return (
    <AsyncFrame state={props}>
      <h1>Members</h1>
      <table>
        <tbody>
          {props.members.map((m) => (
            <tr key={m.membershipId}>
              <td>{m.user.name}{m.isSelf ? ' (you)' : ''}</td>
              <td>{m.email}</td>
              <td>
                {props.canManage && !m.isSelf ? (
                  <select aria-label={`Role for ${m.email}`} value={m.role} onChange={(e) => props.onChangeRole({ membershipId: m.membershipId, role: e.target.value as Role })}>
                    {props.roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  m.roleLabel
                )}
              </td>
              <td>{m.expires ? `Access until ${when(m.expires)}` : ''}</td>
              <td>{props.canManage && !m.isSelf && <button type="button" onClick={() => props.onRemove(m.membershipId)}>Remove</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            props.onInvite({ ...invite, expiresAt: invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null });
          }}
        >
          <h2>{props.empty.actionLabel ?? 'Invite'}</h2>
          <input aria-label="Name" required placeholder="Name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <input aria-label="Email" type="email" required placeholder="Email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <select aria-label="Role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
            {props.roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {invite.role === 'auditor' && (
            <input aria-label="Access expires" type="date" required value={invite.expiresAt} onChange={(e) => setInvite({ ...invite, expiresAt: e.target.value })} />
          )}
          <button type="submit">Send invite</button>
        </form>
      )}
    </AsyncFrame>
  );
}
