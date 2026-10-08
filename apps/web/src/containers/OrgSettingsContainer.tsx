'use client';

import { can } from '@certa/core';
import { CertaApiError, unwrap } from '@certa/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { keys } from '@/data/session';
import { api } from '@/lib/api';
import { useCurrentOrg } from '@/lib/current-org';
import { OrgSettingsScreen } from '@/screens';

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];

export function OrgSettingsContainer() {
  const { org, role } = useCurrentOrg();
  const o = org.organization;
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (v: { name: string; timezone: string; units: typeof o.units }) =>
      unwrap(await api.PATCH('/api/v1/orgs/{orgId}', { params: { path: { orgId: o.id } }, body: v })),
    onSuccess: (data) => {
      setError(null);
      qc.setQueryData(keys.org(o.id), data);
      return qc.invalidateQueries({ queryKey: keys.me });
    },
    onError: (err) => setError(err instanceof CertaApiError ? err.message : 'Could not save settings.'),
  });
  const values = useMemo(
    () => ({ name: o.name, timezone: o.timezone, units: { ...o.units }, defaultJurisdiction: o.defaultJurisdiction }),
    [o],
  );
  const zones = ZONES.includes(o.timezone) ? ZONES : [o.timezone, ...ZONES];
  return (
    <OrgSettingsScreen
      loading={false}
      error={error}
      values={values}
      options={{
        timezones: zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') })),
        length: [{ value: 'ft', label: 'Feet' }, { value: 'm', label: 'Metres' }],
        speed: [{ value: 'mph', label: 'mph' }, { value: 'kph', label: 'km/h' }, { value: 'kt', label: 'Knots' }, { value: 'mps', label: 'm/s' }],
        mass: [{ value: 'lb', label: 'Pounds' }, { value: 'kg', label: 'Kilograms' }, { value: 'g', label: 'Grams' }],
        temperature: [{ value: 'F', label: '°F' }, { value: 'C', label: '°C' }],
        jurisdictions: [{ value: 'US-FAA-Part107', label: 'United States — FAA Part 107' }],
      }}
      canEdit={can(role, 'org.update')}
      saving={save.isPending}
      onSave={(v) =>
        save.mutate({
          name: v.name,
          timezone: v.timezone,
          units: v.units as typeof o.units,
        })
      }
    />
  );
}
