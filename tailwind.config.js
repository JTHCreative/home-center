/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Palette is driven by CSS variables (see index.css) so themes can be
        // swapped at runtime. Channels are space-separated RGB for alpha support.
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        gain: 'rgb(var(--c-gain) / <alpha-value>)',
        loss: 'rgb(var(--c-loss) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Subtle glow for active / focused elements (tracks the theme accent).
        glow: '0 0 0 1px rgb(var(--c-accent) / 0.4), 0 0 16px rgb(var(--c-accent) / 0.25)',
        'glow-gain': '0 0 16px rgb(var(--c-gain) / 0.25)',
      },
    },
  },
  plugins: [],
}
