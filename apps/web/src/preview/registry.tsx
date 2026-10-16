'use client';

import { auth, scenarios, states } from '@certa/contract/fixtures';
import type { AsyncState, ThemeName } from '@certa/contract';
import { useMemo, useState, type ReactNode } from 'react';
import {
  AircraftDetailScreen,
  AircraftFormScreen,
  AircraftListScreen,
  AppShell,
  AuditLogScreen,
  BatteryListScreen,
  FlightDetailScreen,
  FlightListScreen,
  IntegrationsScreen,
  InsuranceScreen,
  LogFlightScreen,
  MaintenanceScreen,
  MembersAdminScreen,
  OrgSettingsScreen,
  PilotDetailScreen,
  PilotFormScreen,
  PilotListScreen,
  RulePackAdminScreen,
  SignInScreen,
  SignUpScreen,
  SyncConflictsScreen,
  TodayScreen,
} from '@/screens';

const noop = () => {};
export const SCENARIOS = ['solo', 'company', 'expired', 'empty', 'longNames', 'large'] as const;
export const STATES = ['loaded', 'loading', 'error', 'partial'] as const;
export type Scenario = (typeof SCENARIOS)[number];
export type State = (typeof STATES)[number];

export interface PreviewScreen {
  id: string;
  title: string;
  group: 'Auth' | 'App' | 'Fleet' | 'Admin';
  route: string;
  shell: boolean;
  /** Variants that don't come from scenarios (auth). */
  variants?: string[];
  render: (opts: { scenario: Scenario; state: State; variant: string | null; theme: ThemeName }) => ReactNode;
}

function stateProps(state: State): AsyncState | null {
  if (state === 'loaded') return null;
  return states[state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'partial'];
}

/** First-load states have no data; partial keeps the data. */
function withState<T extends object>(data: T, state: State, emptyFn: (d: T) => T): T {
  const s = stateProps(state);
  if (!s) return data;
  return state === 'partial' ? { ...data, ...s } : { ...emptyFn(data), ...s };
}

function RulesPreview({ scenario, state }: { scenario: Scenario; state: State }) {
  const base = scenarios[scenario]!.screens.rulePackAdmin;
  const [filter, setFilter] = useState(base.filter);
  const rules = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return base.rules
      .filter((r) => !filter.unverifiedOnly || r.needsVerification)
      .filter((r) => !filter.appliesTo || r.appliesTo === filter.appliesTo)
      .filter((r) => !q || `${r.id} ${r.title} ${r.sourceCitation}`.toLowerCase().includes(q));
  }, [base.rules, filter]);
  const data = withState({ ...base, rules, filter }, state, (d) => ({ ...d, rules: [], pack: null, credentialTypes: [] }));
  return <RulePackAdminScreen {...data} onFilterChange={setFilter} onSetOverride={noop} onClearOverride={noop} onSelectJurisdiction={noop} />;
}

export const SCREENS: PreviewScreen[] = [
  {
    id: 'sign-in',
    title: 'Sign in',
    group: 'Auth',
    route: '/sign-in',
    shell: false,
    variants: ['default', 'error', 'magic-link-sent', 'loading'],
    render: ({ variant }) => {
      const d = variant === 'error' ? auth.signInError : variant === 'magic-link-sent' ? auth.signInMagicLinkSent : auth.signIn;
      return <SignInScreen {...d} loading={variant === 'loading'} onSubmitPassword={noop} onRequestMagicLink={noop} onSignInWithSso={noop} onGoToSignUp={noop} />;
    },
  },
  {
    id: 'sign-up',
    title: 'Sign up',
    group: 'Auth',
    route: '/sign-up',
    shell: false,
    variants: ['default', 'error'],
    render: ({ variant }) => (
      <SignUpScreen {...auth.signUp} error={variant === 'error' ? 'An account with that email already exists.' : null} onSubmit={noop} onGoToSignIn={noop} />
    ),
  },
  {
    id: 'today',
    title: 'Today (readiness)',
    group: 'App',
    route: '/',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.readinessDashboard, state, (x) => ({ ...x, pilots: [], aircraft: [], upcoming: [] }));
      return <TodayScreen {...d} onAddPilot={noop} onAddAircraft={noop} onLogFlight={noop} onOpen={noop} onFix={noop} />;
    },
  },
  {
    id: 'pilots',
    title: 'Pilots',
    group: 'Fleet',
    route: '/pilots',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.pilotList, state, (x) => ({ ...x, pilots: [] }));
      return <PilotListScreen {...d} onSearch={noop} onAddPilot={noop} onOpenPilot={noop} />;
    },
  },
  {
    id: 'pilot',
    title: 'Pilot detail',
    group: 'Fleet',
    route: '/pilots',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.pilotDetail, state, (x) => ({ ...x, pilot: null, credentials: [], recentFlights: [] }));
      return <PilotDetailScreen {...d} onEditPilot={noop} onAddCredential={noop} onEditCredential={noop} onUpdateCredential={noop} onRemoveCredential={noop} onExportLogbook={noop} onOpenFlight={noop} onCreateShareLink={noop} onRevokeShareLink={noop} />;
    },
  },
  {
    id: 'pilot-form',
    title: 'Add pilot',
    group: 'Fleet',
    route: '/pilots',
    shell: true,
    variants: ['create', 'errors'],
    render: ({ variant }) => (
      <PilotFormScreen
        mode="create"
        loading={false}
        error={null}
        saving={false}
        values={{ displayName: variant === 'errors' ? 'Maya Thornton' : '', email: variant === 'errors' ? 'maya@' : '', phone: '', certificateNumber: '', inviteAsUser: false, role: 'pilot' }}
        fieldErrors={variant === 'errors' ? { email: 'Enter a valid email address' } : {}}
        onSubmit={noop}
        onCancel={noop}
      />
    ),
  },
  {
    id: 'aircraft',
    title: 'Aircraft',
    group: 'Fleet',
    route: '/aircraft',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.aircraftList, state, (x) => ({ ...x, aircraft: [] }));
      return <AircraftListScreen {...d} onSearch={noop} onStatusFilter={noop} onAddAircraft={noop} onOpenAircraft={noop} />;
    },
  },
  {
    id: 'aircraft-detail',
    title: 'Aircraft detail',
    group: 'Fleet',
    route: '/aircraft',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.aircraftDetail, state, (x) => ({ ...x, aircraft: null, recentFlights: [], batteries: [] }));
      return <AircraftDetailScreen {...d} onEdit={noop} onGround={noop} onUnground={noop} onExportLogbook={noop} onOpenFlight={noop} onCreateShareLink={noop} onRevokeShareLink={noop} onUploadModel={noop} onRemoveModel={noop} />;
    },
  },
  {
    id: 'aircraft-form',
    title: 'Add aircraft',
    group: 'Fleet',
    route: '/aircraft',
    shell: true,
    render: () => (
      <AircraftFormScreen
        mode="create"
        loading={false}
        error={null}
        saving={false}
        values={{ nickname: '', make: '', model: '', serialNumber: '', registrationNumber: '', registrationExpiresOn: '', remoteIdMethod: 'standard', remoteIdSerial: '', takeoffMass: '', firmwareVersion: '' }}
        massUnitLabel="lb"
        remoteIdOptions={[
          { value: 'standard', label: 'Standard Remote ID' },
          { value: 'broadcast_module', label: 'Broadcast module' },
          { value: 'fria', label: 'FRIA only (no Remote ID equipment)' },
          { value: 'none', label: 'None' },
        ]}
        fieldErrors={{}}
        onSubmit={noop}
        onCancel={noop}
      />
    ),
  },
  {
    id: 'batteries',
    title: 'Batteries',
    group: 'Fleet',
    route: '/batteries',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.batteryList, state, (x) => ({ ...x, batteries: [] }));
      return <BatteryListScreen {...d} onAddBattery={noop} onCreateBattery={noop} onRetireBattery={noop} onOpenBattery={noop} />;
    },
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    group: 'Fleet',
    route: '/maintenance',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.maintenance, state, (x) => ({ ...x, due: [], history: [] }));
      return <MaintenanceScreen {...d} onAddSchedule={noop} onLogMaintenance={noop} onRemoveSchedule={noop} onOpenTarget={noop} />;
    },
  },
  {
    id: 'insurance',
    title: 'Insurance',
    group: 'Fleet',
    route: '/insurance',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.insurance, state, (x) => ({ ...x, policies: [], uncoveredAircraft: [] }));
      return <InsuranceScreen {...d} onAddPolicy={noop} onRemovePolicy={noop} onOpenAircraft={noop} />;
    },
  },
  {
    id: 'flights',
    title: 'Flights',
    group: 'App',
    route: '/flights',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.flightList, state, (x) => ({ ...x, flights: { items: [], total: 0, nextCursor: null } }));
      return <FlightListScreen {...d} onFilterChange={noop} onLoadMore={noop} onLogFlight={noop} onImport={noop} onOpenFlight={noop} />;
    },
  },
  {
    id: 'flight',
    title: 'Flight detail',
    group: 'App',
    route: '/flights',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.flightDetail, state, (x) => ({ ...x, flight: null, path: null, altitudeProfile: [] }));
      return <FlightDetailScreen {...d} onEdit={noop} onDelete={noop} />;
    },
  },
  {
    id: 'log-flight',
    title: 'Log a flight',
    group: 'App',
    route: '/flights',
    shell: true,
    variants: ['default', 'conditions'],
    render: ({ scenario, state, variant }) => {
      const base = withState(scenarios[scenario]!.screens.logFlight, state, (x) => x);
      const d =
        variant === 'conditions'
          ? {
              ...base,
              conditions: {
                status: 'ready' as const,
                weatherSummary: 'Clear, 57°F, wind 8 mph from 150°',
                checkedAt: { iso: '2026-10-08T16:00:00Z', absolute: 'Oct 8, 2026, 10:00 AM MDT', relative: 'just now', display: 'just now', daysFromToday: 0 },
                error: null,
                advisories: [
                  { level: 'amber' as const, title: 'Class D near Centennial', detail: 'Authorization required (14 CFR 107.41). LAANC available up to 200 ft AGL.', source: 'FAA UAS Facility Map' },
                  { level: 'green' as const, title: 'Weather within typical limits', detail: 'Clear', source: 'National Weather Service' },
                  { level: 'amber' as const, title: 'Check TFRs and NOTAMs', detail: 'Temporary flight restrictions are not checked by Certa. Use B4UFLY or an FAA-approved LAANC provider.', source: 'Reminder' },
                ],
              },
            }
          : base;
      return <LogFlightScreen {...d} onCheckConditions={noop} onSelectionChange={noop} onSameAsLast={noop} onSubmit={noop} onCancel={noop} />;
    },
  },
  {
    id: 'sync-conflicts',
    title: 'Sync: needs review',
    group: 'App',
    route: '/sync/conflicts',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.syncConflicts, state, (x) => ({ ...x, conflicts: [] }));
      return <SyncConflictsScreen {...d} onResolve={noop} />;
    },
  },
  {
    id: 'integrations',
    title: 'Integrations (API keys)',
    group: 'Admin',
    route: '/admin/integrations',
    shell: true,
    variants: ['keys', 'just-created', 'empty'],
    render: ({ variant, state }) => {
      const d = (iso: string, display: string) => ({ iso, absolute: display, relative: display, display, daysFromToday: 0 });
      const keys =
        variant === 'empty'
          ? []
          : [
              { id: 'k1', name: 'Argus production', prefix: 'ck_7f3a91c0d2e4', scopes: ['verify:read'], lastUsed: d('2026-10-08T15:40:00Z', 'Oct 8, 2026, 9:40 AM MDT — 20 min ago'), expires: d('2027-10-01', 'Oct 1, 2027 — in 12 months'), created: d('2026-10-01', 'Oct 1, 2026 — 7 days ago') },
              { id: 'k2', name: 'Argus staging', prefix: 'ck_04be55aa1f90', scopes: ['verify:read'], lastUsed: null, expires: null, created: d('2026-10-05', 'Oct 5, 2026 — 3 days ago') },
            ];
      return (
        <IntegrationsScreen
          {...(stateProps(state) ?? { loading: false, error: null })}
          keys={keys}
          createdKey={variant === 'just-created' ? 'ck_7f3a91c0d2e4_Qm9yZWFzLXNhbXBsZS1rZXktbm90LXJlYWwtMTIzNDU2' : null}
          creating={false}
          canManage
          apiBaseUrl="https://arkhonindustries.com/certa/api/v1"
          onCreateKey={noop}
          onRevokeKey={noop}
          onDismissKey={noop}
        />
      );
    },
  },
  { id: 'rules', title: 'Rule pack', group: 'Admin', route: '/admin/rules', shell: true, render: ({ scenario, state }) => <RulesPreview scenario={scenario} state={state} /> },
  {
    id: 'members',
    title: 'Members',
    group: 'Admin',
    route: '/admin/members',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.membersAdmin, state, (x) => ({ ...x, members: [] }));
      return <MembersAdminScreen {...d} onInvite={noop} onChangeRole={noop} onSetExpiry={noop} onRemove={noop} />;
    },
  },
  {
    id: 'settings',
    title: 'Organization settings',
    group: 'Admin',
    route: '/settings/organization',
    shell: true,
    render: ({ scenario, state }) => {
      const d = scenarios[scenario]!.screens.orgSettings;
      return <OrgSettingsScreen {...d} {...(stateProps(state) ?? {})} onSave={noop} onToggleNotifications={noop} onTestNotification={noop} />;
    },
  },
  {
    id: 'audit',
    title: 'Audit log',
    group: 'Admin',
    route: '/admin/audit',
    shell: true,
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.auditLog, state, (x) => ({ ...x, events: [] }));
      return <AuditLogScreen {...d} onFilterChange={noop} onLoadMore={noop} />;
    },
  },
];

export function PreviewFrame({ screen, scenario, state, variant, theme, field, onTheme }: { screen: PreviewScreen; scenario: Scenario; state: State; variant: string | null; theme: ThemeName; field: boolean; onTheme: (t: ThemeName) => void }) {
  const content = screen.render({ scenario, state, variant, theme });
  if (!screen.shell) return <>{content}</>;
  const s = scenarios[scenario]!;
  const shell = field ? s.fieldShell : s.shell;
  const navigation = shell.navigation.map((n) => ({ ...n, active: n.href === screen.route }));
  return (
    <AppShell {...shell} navigation={navigation} theme={theme} onSwitchOrg={noop} onSignOut={noop} onNavigate={noop} onThemeChange={onTheme} onSyncNow={noop} onSearch={noop}>
      {content}
    </AppShell>
  );
}
