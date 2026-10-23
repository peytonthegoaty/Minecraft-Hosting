/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
module.exports = {
  content: [__dirname + '/src/renderer/index.html', __dirname + '/src/renderer/src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        raised: v('raised'),
        hover: v('hover'),
        line: v('border'),
        fg: v('text'),
        muted: v('muted'),
        accent: v('accent'),
        'on-accent': v('on-accent'),
        success: v('success'),
        warn: v('warn'),
        danger: v('danger'),
        info: v('info'),
        code: v('code'),
        str: v('string'),
        num: v('number')
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace']
      },
      borderRadius: { card: '12px' }
    }
  },
  plugins: []
}
