/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b0b0c',
          900: '#121214',
          850: '#151517',
          800: '#17171a',
          750: '#1c1c20',
          700: '#222226',
        },
        line: {
          DEFAULT: '#2a2a2e',
          strong: '#3a3a40',
        },
        paper: '#e7e3d9',
        muted: '#8b8880',
        dim: '#5f5d58',
        amber: {
          DEFAULT: '#e8b15a',
          dim: '#b8863f',
          soft: '#e8b15a22',
        },
        moss: '#8fb573',
        rust: '#d96c5f',
        steel: '#7fa6c9',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '3px',
      },
      boxShadow: {
        window: '0 8px 0 0 #00000055, 0 0 0 1px #000000',
      },
    },
  },
  plugins: [],
}
