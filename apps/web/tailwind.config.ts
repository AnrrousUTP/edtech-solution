import type { Config } from 'tailwindcss'

// Sistema Google Skills-inspired para EdTech: usamos la lógica cromática,
// espacial y tipográfica observada en el producto de referencia, sin copiar
// logos, assets, iconografía ni afirmar afiliación.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          50: '#e8f0fe',
          100: '#c6dafc',
          400: '#7baaf7',
          500: '#4285f4',
          600: '#0b57d0', // acciones primarias, progreso
          700: '#3367d6',
          900: '#0b3d91',
        },
        acento: { 100: '#fce8b2', 400: '#f7cb4d', 600: '#f4b400' }, // rachas, insignias
        exito: { 100: '#b7e1cd', 500: '#0f9d58', 700: '#0b8043' }, // completado, aprobado
        alerta: { 100: '#ffebee', 500: '#db4437', 700: '#c53929' }, // reprobado, error
        superficie: {
          base: '#ffffff',
          suave: '#f0f4f9',
          buscador: '#e9eef6',
          tinta: '#1f1f1f',
          secundaria: '#5f6368',
          borde: '#dadce0',
        },
      },
      // Las variables las define next/font en el <html> (layout.tsx). Declarar
      // aquí el nombre de la familia sin cargarla en ningún lado era el bug: la
      // UI caía al system-ui de siempre y perdía toda la identidad del doc 11 §3.
      fontFamily: {
        sans: ['var(--fuente-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--fuente-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { lg: '12px', xl: '16px', panel: '28px' },
      boxShadow: {
        suave: '0 1px 3px rgb(15 23 42 / 0.06), 0 1px 2px rgb(15 23 42 / 0.04)',
        media: '0 4px 12px rgb(15 23 42 / 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config
