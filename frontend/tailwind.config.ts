import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#ecfdf5',
          500: '#10b981',
          600: '#059669',
          900: '#065f46',
        },
        eco: {
          green: '#22c55e',
          orange: '#f59e0b',
          red: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
}

export default config

