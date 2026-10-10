import { z } from 'zod';

export const ROLES = [
  'owner',
  'admin',
  'chief_pilot',
  'pilot',
  'maintenance_tech',
  'viewer',
  'auditor',
] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

export const PlanTier = z.enum(['solo', 'team', 'enterprise', 'self_hosted']);
export type PlanTier = z.infer<typeof PlanTier>;

export const JurisdictionId = z
  .string()
  .regex(/^[A-Z]{2}-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/, 'Jurisdiction ids look like US-FAA-Part107');
export type JurisdictionId = z.infer<typeof JurisdictionId>;

export const LengthUnit = z.enum(['ft', 'm']);
export const SpeedUnit = z.enum(['mph', 'kph', 'kt', 'mps']);
export const MassUnit = z.enum(['lb', 'kg', 'g']);
export const TemperatureUnit = z.enum(['F', 'C']);
export type LengthUnit = z.infer<typeof LengthUnit>;
export type SpeedUnit = z.infer<typeof SpeedUnit>;
export type MassUnit = z.infer<typeof MassUnit>;
export type TemperatureUnit = z.infer<typeof TemperatureUnit>;

export const UnitsPreference = z.object({
  length: LengthUnit,
  speed: SpeedUnit,
  mass: MassUnit,
  temperature: TemperatureUnit,
});
export type UnitsPreference = z.infer<typeof UnitsPreference>;

export const AircraftStatus = z.enum(['active', 'grounded', 'retired']);
export type AircraftStatus = z.infer<typeof AircraftStatus>;

/** Airframe shape, for drawing an aircraft (e.g. the Today hangar). Derived from make and model. */
export const Airframe = z.enum(['quad', 'hex', 'octo', 'fixed_wing_vtol']);
export type Airframe = z.infer<typeof Airframe>;

export const RemoteIdMethod = z.enum(['standard', 'broadcast_module', 'fria', 'none']);
export type RemoteIdMethod = z.infer<typeof RemoteIdMethod>;

export const ComponentKind = z.enum(['motor', 'propeller', 'gimbal', 'payload', 'sensor', 'other']);
export type ComponentKind = z.infer<typeof ComponentKind>;

export const BatteryChemistry = z.enum(['lipo', 'lihv', 'liion', 'other']);
export const BatteryStatus = z.enum(['active', 'watch', 'retired']);
export type BatteryChemistry = z.infer<typeof BatteryChemistry>;
export type BatteryStatus = z.infer<typeof BatteryStatus>;

export const FlightSource = z.enum(['manual', 'import']);
export type FlightSource = z.infer<typeof FlightSource>;

export const OperationType = z.enum([
  'commercial',
  'training',
  'public_safety',
  'research',
  'maintenance_test',
  'recreational',
  'other',
]);
export type OperationType = z.infer<typeof OperationType>;

export const AirspaceClass = z.enum(['A', 'B', 'C', 'D', 'E', 'G', 'unknown']);
export type AirspaceClass = z.infer<typeof AirspaceClass>;

export const AuthorizationKind = z.enum([
  'laanc',
  'airspace_authorization',
  'waiver',
  'coa',
  'other',
]);
export type AuthorizationKind = z.infer<typeof AuthorizationKind>;

export const MissionStatus = z.enum(['draft', 'planned', 'in_progress', 'completed', 'cancelled']);
export type MissionStatus = z.infer<typeof MissionStatus>;

export const ChecklistKind = z.enum(['preflight', 'postflight', 'emergency', 'other']);
export type ChecklistKind = z.infer<typeof ChecklistKind>;

export const MaintenanceKind = z.enum(['scheduled', 'unscheduled']);
export type MaintenanceKind = z.infer<typeof MaintenanceKind>;

export const IncidentType = z.enum([
  'damage',
  'injury',
  'flyaway',
  'near_miss',
  'loss_of_link',
  'other',
]);
export type IncidentType = z.infer<typeof IncidentType>;

export const IncidentSeverity = z.enum(['minor', 'moderate', 'serious', 'critical']);
export type IncidentSeverity = z.infer<typeof IncidentSeverity>;

export const IncidentStatus = z.enum(['open', 'investigating', 'corrective_action', 'closed']);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const ReadinessLevel = z.enum(['green', 'amber', 'red']);
export type ReadinessLevel = z.infer<typeof ReadinessLevel>;

/** Entity types that may own documents, appear in the audit log, or be chained. */
export const EntityType = z.enum([
  'organization',
  'membership',
  'pilot',
  'credential',
  'training_record',
  'aircraft',
  'component',
  'battery',
  'flight',
  'mission',
  'client',
  'site',
  'authorization',
  'checklist_template',
  'checklist_run',
  'maintenance_schedule',
  'maintenance_event',
  'incident',
  'insurance_policy',
  'document',
]);
export type EntityType = z.infer<typeof EntityType>;
