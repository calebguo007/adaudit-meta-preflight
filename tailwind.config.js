/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        panel: 'var(--panel)',
        'panel-2': 'var(--panel-2)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        soft: 'var(--soft)',
        line: 'var(--line)',
        'line-dark': 'var(--line-dark)',
        red: 'var(--red)',
        'red-bg': 'var(--red-bg)',
        amber: 'var(--amber)',
        'amber-bg': 'var(--amber-bg)',
        green: 'var(--green)',
        'green-bg': 'var(--green-bg)',
        blue: 'var(--blue)',
        violet: 'var(--violet)',
        cyan: 'var(--cyan)',
        status: {
          idle: 'var(--status-idle)',
          active: 'var(--status-active)',
          fail: 'var(--status-fail)',
          warn: 'var(--status-warn)',
          pass: 'var(--status-pass)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
}