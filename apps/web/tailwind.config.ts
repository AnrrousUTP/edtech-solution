import type { Config } from 'tailwindcss'

// Tokens del doc 11 §3. Lenguaje visual propio: inspirado en la progresión
// gamificada de Duolingo y la seriedad curricular de Google Skills, sin copiar
// assets, iconografía ni marca de ninguno.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          50: '#eef2ff',
          100: '#e0e7ff',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5', // acciones primarias, progreso
          700: '#4338ca',
          900: '#312e81',
        },
        acento: { 100: '#fef3c7', 400: '#fbbf24', 600: '#d97706' }, // rachas, insignias
        exito: { 100: '#d1fae5', 500: '#10b981', 700: '#047857' }, // completado, aprobado
        alerta: { 100: '#ffe4e6', 500: '#f43f5e', 700: '#be123c' }, // reprobado, error
      },
      // Las variables las define next/font en el <html> (layout.tsx). Declarar
      // aquí el nombre de la familia sin cargarla en ningún lado era el bug: la
      // UI caía al system-ui de siempre y perdía toda la identidad del doc 11 §3.
      fontFamily: {
        sans: ['var(--fuente-ui)', 'ui-rounded', 'system-ui', 'sans-serif'],
        mono: ['var(--fuente-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { lg: '12px', xl: '16px' },
      boxShadow: {
        suave: '0 1px 3px rgb(15 23 42 / 0.06), 0 1px 2px rgb(15 23 42 / 0.04)',
        media: '0 4px 12px rgb(15 23 42 / 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config
