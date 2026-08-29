import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/out/persistencia/schema.ts',
  out: './migrations',
  schemaFilter: ['enrollment'],
})
