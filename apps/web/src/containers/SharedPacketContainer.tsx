'use client';

import type { InspectorPacket } from '@certa/core';
import { CertaApiError, unwrap } from '@certa/sdk';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { withBase } from '@/lib/base-path';
import { SharedPacketScreen } from '@/screens';

/** Public, no-account view of an inspector packet behind a share link. */
export function SharedPacketContainer({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ['share', token],
    retry: false,
    queryFn: async () => unwrap(await api.GET('/api/v1/public/share/{token}', { params: { path: { token } } })),
  });
  const gone = q.error instanceof CertaApiError && (q.error.status === 404 || q.error.status === 400);
  return (
    <SharedPacketScreen
      loading={q.isLoading}
      error={gone ? 'This link has expired, was revoked, or is incorrect. Ask the operator for a new one.' : q.error ? 'We couldn’t load this packet. Try again shortly.' : null}
      data={
        q.data
          ? { label: q.data.label, seal: q.data.seal, packet: q.data.packet as InspectorPacket, expires: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(q.data.expiresAt)) }
          : null
      }
      pdfHref={withBase(`/api/v1/public/share/${encodeURIComponent(token)}/packet.pdf`)}
    />
  );
}
