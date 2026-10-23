'use client';

import { unwrap } from '@certa/sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { messageOf } from '@/data/fleet';
import { api } from '@/lib/api';
import { useCurrentOrg } from '@/lib/current-org';
import { LiveLinkScreen, type LiveLinkStage } from '@/screens';

/** The parts of DJI Pilot 2's JSBridge (DJI Cloud API) this page uses. Each call returns a JSON string. */
interface DjiBridge {
  platformVerifyLicense(appId: number, appKey: string, license: string): string;
  platformIsVerified(): string;
  platformGetRemoteControllerSN(): string;
  platformGetAircraftSN(): string;
  platformSetWorkspaceId(id: string): string;
  platformSetInformation(platformName: string, workspaceName: string, desc: string): string;
  platformLoadComponent(name: string, param: string): string;
  thingGetConnectState?(): string;
  platformStopSelf?(): string;
}
declare global {
  interface Window {
    djiBridge?: DjiBridge;
    certaThingConnected?: (connected: boolean) => void;
  }
}

/** Bridge replies look like {"code":0,"message":"","data":…}; anything else counts as a failure. */
function call<T = unknown>(fn: () => string): T {
  const raw = fn();
  let r: { code?: number; message?: string; data?: unknown };
  try {
    r = JSON.parse(raw) as typeof r;
  } catch {
    throw new Error('DJI Pilot 2 gave an unexpected reply.');
  }
  if (r.code !== 0) throw new Error(r.message || 'DJI Pilot 2 refused the request.');
  return r.data as T;
}
const serial = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9]{6,40}$/.test(v) ? v : null);

export function LiveLinkContainer() {
  const { org } = useCurrentOrg();
  const orgId = org.organization.id;
  const [bridge, setBridge] = useState<DjiBridge | null | undefined>(undefined);
  const [serials, setSerials] = useState<{ controller: string | null; aircraft: string | null }>({ controller: null, aircraft: null });
  const [stage, setStage] = useState<'idle' | 'linking' | 'linked'>('idle');
  const [error, setError] = useState<string | null>(null);
  const setup = useQuery({
    queryKey: ['org', orgId, 'live', 'dji-setup'],
    queryFn: async () => unwrap(await api.GET('/api/v1/orgs/{orgId}/live/dji-setup', { params: { path: { orgId } } })),
  });

  useEffect(() => setBridge(typeof window !== 'undefined' && window.djiBridge ? window.djiBridge : null), []);

  // Pilot 2 only reveals serials once this app's DJI license is verified.
  useEffect(() => {
    const s = setup.data;
    if (!bridge || !s?.enabled || !s.appId || !s.appKey || !s.license) return;
    try {
      call(() => bridge.platformVerifyLicense(s.appId!, s.appKey!, s.license!));
      setSerials({ controller: serial(call(() => bridge.platformGetRemoteControllerSN())), aircraft: serial(call(() => bridge.platformGetAircraftSN())) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DJI Pilot 2 couldn’t verify Certa.');
    }
  }, [bridge, setup.data]);

  const link = async () => {
    if (!bridge || !serials.controller) return;
    setError(null);
    setStage('linking');
    try {
      const r = unwrap(await api.POST('/api/v1/orgs/{orgId}/live/devices/bind', { params: { path: { orgId } }, body: { gatewaySn: serials.controller, aircraftSn: serials.aircraft } }));
      call(() => bridge.platformSetWorkspaceId(r.workspaceId));
      call(() => bridge.platformSetInformation('Certa', r.workspaceName, 'Flight logbook by Arkhon Industries'));
      window.certaThingConnected = (connected) => {
        if (connected) setStage('linked');
        else {
          setStage('idle');
          setError('The controller couldn’t reach Certa’s message server. Check the controller’s internet connection and try again.');
        }
      };
      call(() => bridge.platformLoadComponent('thing', JSON.stringify({ host: r.mqtt.host, username: r.mqtt.username, password: r.mqtt.password, connectCallback: 'certaThingConnected' })));
    } catch (e) {
      setStage('idle');
      setError(e instanceof Error && !('status' in e) ? e.message : messageOf(e, 'We couldn’t link this controller.'));
    }
  };

  const view: LiveLinkStage =
    setup.isLoading || bridge === undefined ? 'loading' : !setup.data?.enabled ? 'disabled' : !bridge ? 'not-pilot2' : stage === 'idle' ? 'ready' : stage;
  return (
    <LiveLinkScreen
      stage={view}
      controller={serials.controller}
      aircraft={serials.aircraft}
      error={error ?? (setup.error ? messageOf(setup.error) : null)}
      onLink={() => void link()}
      onDone={() => {
        try {
          bridge?.platformStopSelf?.();
        } catch {
          // Older Pilot 2 builds lack platformStopSelf; the pilot just backs out.
        }
      }}
    />
  );
}
