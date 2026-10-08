<!-- docs/UI-HANDOFF.md -->
# Certa UI foundation

Certa follows the live Arkhon Industries and Argus public pages inspected on October 8, 2026: white surfaces, charcoal text and actions, system/Geist typography, pill actions, fine neutral dividers, restrained panels, and small uppercase eyebrow labels. The light theme is the default to match those references. Dark and sunlight themes retain the same visual hierarchy. No gradient is introduced; status colors serve status meaning only.

References: https://arkhonindustries.com/ and https://arkhonindustries.com/argus. The authenticated Argus application was not inspected. These tokens match the public visual language, not a verified private application design system.

## Integration

Import `packages/ui/theme.css` once in the web root. Apply `certa` and `data-theme="light"`, `dark`, or `sunlight` on the application wrapper. Theme preference and persistence belong to the host. Import the shared Tailwind preset into the host config; the host owns content globs and framework setup. NativeWind hosts can consume the same preset, with `themeVariables(theme)` supplied through their CSS-variable adapter. Native components must explicitly consume typography, touch sizes, and motion tokens; web CSS selectors do not style React Native.

Use 48px minimum mobile targets and 56px primary field actions. Numeric columns use monospace/tabular figures. Status must include an icon and text; never infer readiness, expiration, or currency in UI code. Keep forms controlled by the host and emit actions through callbacks. Use real accessible primitives for menus and dialogs once the package versions are established.

## Contract requests

The repository was empty at checkout. Claude Code must supply `contract/types.ts`, `contract/SCREENS.md`, and fixtures before contract-bound screens can be implemented. Needed entries cover shell navigation, organization/user display, sync state, authentication/onboarding, Today/readiness, pilots, aircraft, batteries, and Quick Log Flight. Entries must specify routes, typed props, callback names, loading/empty/error/offline/partial states, formatted values, and fixtures for each state. No domain types, routes, data records, or screen callbacks have been invented here.

## Validation limits

The foundation has no framework or package dependency and does not install or replace Claude Code's architecture. Text/status contrast is checked against canvas, surface, and inset colors; this does not establish full WCAG conformance of future screens. The visual reference preview demonstrates styling only, with no operational records or integrations.
