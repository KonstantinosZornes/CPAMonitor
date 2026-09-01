/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#070A0F',
          900: '#0B0F17',
          850: '#0E1420',
          800: '#131B2A',
          750: '#182236',
          700: '#1E2B45',
          600: '#2A3C5F',
          500: '#3D5480',
          400: '#647EA8',
          300: '#94A7C6',
          200: '#CBD5E1',
          100: '#E2E8F0',
        },
        brand: {
          blue: '#3B82F6',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#EF4444',
          purple: '#8B5CF6',
          cyan: '#06B6D4',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Roboto Mono', 'ui-monospace', 'monospace'],
      }
    },
  },
  plugins: [],
}
