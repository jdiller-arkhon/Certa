// packages/ui/tailwind.preset.ts
import { tokens } from './tokens';

/** Shared by Tailwind and NativeWind hosts; host applications own content globs. */
export default {
  theme: {
    extend: {
      colors: Object.fromEntries(Object.keys(tokens.themes.light).map(key => [key, `var(--certa-${key})`])),
      fontFamily: { sans: [tokens.typography.sans], mono: [tokens.typography.mono] },
      borderRadius: Object.fromEntries(Object.entries(tokens.radius).map(([key, value]) => [key, `${value}px`])),
      spacing: Object.fromEntries(Object.entries(tokens.spacing).map(([key, value]) => [key, `${value}px`])),
      transitionDuration: { ui: `${tokens.motion.duration}ms` },
      transitionTimingFunction: { ui: tokens.motion.easing },
      minHeight: { touch: `${tokens.touch.minimum}px`, field: `${tokens.touch.field}px` },
    },
  },
};
