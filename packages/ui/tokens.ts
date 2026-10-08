// packages/ui/tokens.ts
export const typography = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Geist, "Helvetica Neue", Arial, sans-serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
} as const;

export const themes = {
  light: {
    canvas: '#ffffff', surface: '#ffffff', inset: '#f5f5f7',
    text: '#1d1d1f', muted: '#5f6168', border: '#d5d5da',
    action: '#2b2b2e', onAction: '#ffffff', focus: '#44444a',
    current: '#14633d', warning: '#805000', expired: '#a32030',
    grounded: '#832539', pending: '#53536b', info: '#245c91',
  },
  dark: {
    canvas: '#111113', surface: '#1c1c1f', inset: '#252528',
    text: '#f5f5f7', muted: '#b3b3bc', border: '#65656e',
    action: '#f5f5f7', onAction: '#1d1d1f', focus: '#ededf2',
    current: '#85ddb0', warning: '#efc56d', expired: '#ff9ba6',
    grounded: '#f5a3b8', pending: '#c3bce6', info: '#9ccaff',
  },
  sunlight: {
    canvas: '#ffffff', surface: '#ffffff', inset: '#f1f1f1',
    text: '#000000', muted: '#333333', border: '#555555',
    action: '#000000', onAction: '#ffffff', focus: '#000000',
    current: '#004023', warning: '#573500', expired: '#760015',
    grounded: '#640d23', pending: '#383047', info: '#003e6d',
  },
} as const;

export type ThemeName = keyof typeof themes;
export const tokens = {
  typography,
  themes,
  spacing: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },
  radius: { control: 12, panel: 20, pill: 9999 },
  motion: { duration: 160, easing: 'cubic-bezier(.2, 0, 0, 1)' },
  touch: { minimum: 48, field: 56 },
} as const;

/** Theme selection belongs to the host app; this function has no DOM side effects. */
export function themeVariables(theme: ThemeName): Record<string, string> {
  return Object.fromEntries(Object.entries(themes[theme]).map(([key, value]) => [`--certa-${key}`, value]));
}
