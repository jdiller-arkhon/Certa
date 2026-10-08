// Host Tailwind config: consumes the frontend's shared preset (packages/ui) and owns content globs.
import preset from '@certa/ui/tailwind.preset';

export default {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', '../../packages/ui/**/*.{ts,tsx}'],
};
