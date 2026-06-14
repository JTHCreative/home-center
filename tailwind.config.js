/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dark modern palette
        bg: '#0D1117',
        surface: '#161B22',
        border: '#30363D',
        accent: '#58A6FF',
        gain: '#39D353',
        loss: '#F85149',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Subtle glow for active / focused elements
        glow: '0 0 0 1px rgba(88,166,255,0.4), 0 0 16px rgba(88,166,255,0.25)',
        'glow-gain': '0 0 16px rgba(57,211,83,0.25)',
      },
    },
  },
  plugins: [],
}
