import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deliberately not the generic purple-blue gradient.
        // Single saturated amber accent against a deep neutral ground —
        // industrial / dark / treasure-island tone.
        ground: {
          DEFAULT: '#0c0a09',
          900: '#0c0a09',
          800: '#1c1917',
          700: '#292524',
          600: '#44403c',
          500: '#78716c',
          400: '#a8a29e',
          300: '#d6d3d1',
          200: '#e7e5e4',
          100: '#f5f5f4',
        },
        ember: {
          DEFAULT: '#f59e0b',
          50: '#fffbeb',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        moss: {
          DEFAULT: '#65a30d',
          400: '#a3e635',
          500: '#84cc16',
          600: '#65a30d',
        },
        rust: {
          DEFAULT: '#ef4444',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      fontFamily: {
        // Mono-leaning display + comfortable body line-height for Chinese.
        display: ['"JetBrains Mono"', '"Noto Sans TC"', 'ui-monospace', 'monospace'],
        body: ['"Noto Sans TC"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      borderRadius: {
        // Sharp edges over rounded-everything.
        sharp: '2px',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        flicker: 'flicker 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
