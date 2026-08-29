import tseslint from 'typescript-eslint'

// ESLint mínimo: las convenciones del proyecto las verifica tools/lint-convenciones.ts
// (doc 12 §3); acá solo lo que ese lint delega en eslint (any injustificado).
export default tseslint.config({
  files: ['services/**/*.ts', 'packages/**/*.ts', 'apps/**/*.{ts,tsx}', 'tools/**/*.ts'],
  ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  languageOptions: { parser: tseslint.parser },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
  },
})
