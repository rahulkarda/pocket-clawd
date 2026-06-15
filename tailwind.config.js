/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: '#0D0D0D',
        panel: '#161616',
        bubble: { claude: '#1A1A2E', user: '#1E1E1E' },
        accent: '#7C6FF7',
        accentSoft: '#5C6BC0',
        textMain: '#F0F0F0',
        textMeta: '#666666',
        success: '#4ADE80'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
}
