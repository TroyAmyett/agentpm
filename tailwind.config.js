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
        // Custom color palette - Funnelists brand
        // Primary: Cyan (#0ea5e9)
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        // Secondary: Green (#22c55e)
        secondary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        // Accent: Purple (#8b5cf6)
        accent: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },
        // Surface: Blue-tinted slate (not zinc grays)
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(148, 163, 184, 0.06)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(14, 165, 233, 0.15)',
        'elevated': '0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(148, 163, 184, 0.05)',
        'glow-sm': '0 0 10px -3px rgba(14, 165, 233, 0.15)',
        'glow-md': '0 0 20px -5px rgba(14, 165, 233, 0.2)',
        'glow-lg': '0 0 30px -5px rgba(14, 165, 233, 0.25)',
        'glow-accent': '0 0 20px -5px rgba(139, 92, 246, 0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 10px -3px rgba(14, 165, 233, 0.1)' },
          '50%': { boxShadow: '0 0 20px -3px rgba(14, 165, 233, 0.3)' },
        },
      },
      borderRadius: {
        'card': '12px',
      },
    },
  },
  plugins: [],
}
