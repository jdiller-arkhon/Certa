# Screens (presentational)

Each file here is a **placeholder** that renders the contract props for one screen, unstyled,
so integration and tests are never blocked. When ChatGPT delivers the real component, replace
the file's contents (keep the export name and props type). Containers in `src/containers/`
import only from this folder's `index.ts`.

| Export | Props (`@certa/contract`) |
|---|---|
| `AppShell` | `AppShellProps` + `children` |
| `SignInScreen` | `SignInScreenProps` |
| `SignUpScreen` | `SignUpScreenProps` |
| `TodayScreen` | `ReadinessDashboardScreenProps` |
| `RulePackAdminScreen` | `RulePackAdminScreenProps` |
| `MembersAdminScreen` | `MembersAdminScreenProps` |
| `OrgSettingsScreen` | `OrgSettingsScreenProps` |
| `AuditLogScreen` | `AuditLogScreenProps` |
