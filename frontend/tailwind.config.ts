import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#EAE4D9', sand: '#C4B7A5', charcoal: '#282722', bronze: '#77634D',
        paper: '#F8F7F3', taupe: '#D8D0C5', stone: '#706C64',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      maxWidth: { page: '1360px' },
      borderRadius: { DEFAULT: '2px', sm: '2px', md: '2px', lg: '2px' },
      transitionTimingFunction: { luxe: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      letterSpacing: { eyebrow: '0.22em' },
    },
  },
  plugins: [],
} satisfies Config;
