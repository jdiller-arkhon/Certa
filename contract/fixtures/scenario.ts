import type {
  AircraftDetailScreenProps,
  AircraftListScreenProps,
  AppShellViewModel,
  AuditLogScreenProps,
  BatteryListScreenProps,
  FlightDetailScreenProps,
  FlightListScreenProps,
  LogFlightScreenProps,
  MembersAdminScreenProps,
  OrgSettingsScreenProps,
  PilotDetailScreenProps,
  PilotListScreenProps,
  ReadinessDashboardScreenProps,
  RulePackAdminScreenProps,
  ScreenData,
  SignInScreenProps,
  SignUpScreenProps,
  SyncConflictsScreenProps,
} from '../types.ts';

/** One coherent organization rendered across every Phase 1–2 screen. */
export interface FixtureScenario {
  id: string;
  description: string;
  /** Shell on the dashboard (active route "/"), online. */
  shell: AppShellViewModel;
  /** Shell in the installed app in the field (sync engine state: offline, pending changes). */
  fieldShell: AppShellViewModel;
  screens: {
    readinessDashboard: ScreenData<ReadinessDashboardScreenProps>;
    pilotList: ScreenData<PilotListScreenProps>;
    pilotDetail: ScreenData<PilotDetailScreenProps>;
    aircraftList: ScreenData<AircraftListScreenProps>;
    aircraftDetail: ScreenData<AircraftDetailScreenProps>;
    batteryList: ScreenData<BatteryListScreenProps>;
    flightList: ScreenData<FlightListScreenProps>;
    flightDetail: ScreenData<FlightDetailScreenProps>;
    logFlight: ScreenData<LogFlightScreenProps>;
    rulePackAdmin: ScreenData<RulePackAdminScreenProps>;
    membersAdmin: ScreenData<MembersAdminScreenProps>;
    orgSettings: ScreenData<OrgSettingsScreenProps>;
    auditLog: ScreenData<AuditLogScreenProps>;
    syncConflicts: ScreenData<SyncConflictsScreenProps>;
  };
}

export interface AuthFixtures {
  signIn: ScreenData<SignInScreenProps>;
  signInMagicLinkSent: ScreenData<SignInScreenProps>;
  signInError: ScreenData<SignInScreenProps>;
  signUp: ScreenData<SignUpScreenProps>;
}
