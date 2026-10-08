'use client';

import type { api as apiTypes, MapContext, Role } from '@certa/core';
import { createContext, useContext } from 'react';

export interface CurrentOrg {
  me: apiTypes.MeResponse;
  org: apiTypes.OrgContextResponse;
  role: Role;
  mapCtx: MapContext;
  switchOrg: (orgId: string) => void;
}

export const CurrentOrgContext = createContext<CurrentOrg | null>(null);

export function useCurrentOrg(): CurrentOrg {
  const v = useContext(CurrentOrgContext);
  if (!v) throw new Error('useCurrentOrg must be used inside the authenticated layout');
  return v;
}

const KEY = 'certa.orgId';
export function readSelectedOrg(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function writeSelectedOrg(orgId: string) {
  try {
    localStorage.setItem(KEY, orgId);
  } catch {}
}
