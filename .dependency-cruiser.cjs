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
        pathNot: 'services/[^/]+/src/infrastructure',
      },
      to: { path: 'node_modules/(drizzle-orm|@aws-sdk|pg)' },
    },
    { name: 'sin-ciclos', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
  },
}
