import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // "Salvage-lit treasure port at night": deep ocean-black ground, warm
        // amber as the light source, oxidized-teal (verdigris/sea) as the cool
        // counter-accent. Deliberately NOT the generic purple-blue gradient.
        ground: {
          DEFAULT: '#0c0a09',
          950: '#070605',
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
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        // Oxidized copper / sea — the cool counter-light to amber.
        tide: {
          DEFAULT: '#14b8a6',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
        },
        // Warm off-white for headings — parchment, not clinical white.
        sand: {
          DEFAULT: '#ece3d2',
          200: '#f3ecdd',
          300: '#ece3d2',
          400: '#d8caac',
        },
        moss: {
          DEFAULT: '#65a30d',
          400: '#a3e635',
          500: '#84cc16',
          600: '#65a30d',
        },
        rust: {
          DEFAULT: '#ef4444',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      fontFamily: {
        // Characterful condensed poster display (Latin) + Noto Sans TC for CJK.
        display: ['"Big Shoulders Display"', '"Noto Sans TC"', 'ui-sans-serif', 'sans-serif'],
        body: ['"Noto Sans TC"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Mono reserved for DATA (gold, ticks, version) — where alignment matters.
        data: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        eyebrow: '0.22em',
      },
      borderRadius: {
        sharp: '2px',
      },
      boxShadow: {
        // Physical "plate" feel: top inner highlight + soft drop shadow.
        panel: '0 1px 0 0 rgba(236,227,210,0.05) inset, 0 10px 30px -16px rgba(0,0,0,0.8)',
        raised:
          '0 1px 0 0 rgba(236,227,210,0.07) inset, 0 18px 40px -18px rgba(0,0,0,0.85)',
        'glow-ember': '0 0 0 1px rgba(245,158,11,0.45), 0 0 22px -4px rgba(245,158,11,0.4)',
        'glow-tide': '0 0 0 1px rgba(20,184,166,0.4), 0 0 20px -4px rgba(20,184,166,0.35)',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        flicker: 'flicker 1.4s ease-in-out infinite',
        rise: 'rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
