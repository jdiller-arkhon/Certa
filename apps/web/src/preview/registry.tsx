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
      return <TodayScreen {...d} onAddPilot={noop} onAddAircraft={noop} onLogFlight={noop} onOpen={noop} />;
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
      return <PilotDetailScreen {...d} onEditPilot={noop} onAddCredential={noop} onEditCredential={noop} onUpdateCredential={noop} onRemoveCredential={noop} onExportLogbook={noop} onOpenFlight={noop} />;
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
      return <AircraftDetailScreen {...d} onEdit={noop} onGround={noop} onUnground={noop} onExportLogbook={noop} onOpenFlight={noop} />;
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
    render: ({ scenario, state }) => {
      const d = withState(scenarios[scenario]!.screens.logFlight, state, (x) => x);
      return <LogFlightScreen {...d} onSelectionChange={noop} onSameAsLast={noop} onSubmit={noop} onCancel={noop} />;
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
      return <OrgSettingsScreen {...d} {...(stateProps(state) ?? {})} onSave={noop} />;
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
    <AppShell {...shell} navigation={navigation} theme={theme} onSwitchOrg={noop} onSignOut={noop} onNavigate={noop} onThemeChange={onTheme} onSyncNow={noop}>
      {content}
    </AppShell>
  );
}
