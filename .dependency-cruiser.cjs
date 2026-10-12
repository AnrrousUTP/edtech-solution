module.exports = {
  forbidden: [
    {
      name: 'dominio-no-importa-app-ni-infra',
      severity: 'error',
      from: { path: 'services/[^/]+/src/domain' },
      to: { path: 'services/[^/]+/src/(application|infrastructure)' },
    },
    {
      name: 'dominio-sin-frameworks',
      severity: 'error',
      from: { path: 'services/[^/]+/src/domain' },
      to: { dependencyTypes: ['npm'], pathNot: 'packages/shared-kernel' },
    },
    {
      name: 'app-sin-express-ni-aws',
      severity: 'error',
      from: { path: 'services/[^/]+/src/application' },
      to: { path: 'node_modules/(express|@aws-sdk|drizzle-orm|pg)' },
    },
    {
      name: 'solo-infra-usa-orm-y-sdk',
      severity: 'error',
      from: {
        path: '^services/',
        // Las Lambdas independientes (p. ej. Cognito triggers) son entrypoints
        // de infraestructura y pueden usar el SDK AWS directamente.
        pathNot: 'services/[^/]+/(src/(infrastructure|lambda)|lambdas)',
      },
      to: { path: 'node_modules/(drizzle-orm|@aws-sdk|pg)' },
    },
    { name: 'sin-ciclos', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    // Terraform provider caches live below each service directory and aren't source modules.
    exclude: '(^|[/\\\\])\\.terraform([/\\\\]|$)',
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
  },
}
