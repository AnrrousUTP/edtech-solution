// Composition root: el ÚNICO archivo que instancia implementaciones concretas.
import {
  CommandBus,
  QueryBus,
  SqsPoller,
  crearSqsClient,
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
  xrayMiddleware,
} from '@edtech/shared-kernel'
import express, { type Express } from 'express'
import { ActualizarPerfilHandler } from '../application/actualizar-perfil/actualizar-perfil.handler'
import { CrearUsuarioHandler } from '../application/crear-usuario/crear-usuario.handler'
import { FijarNivelPorTestHandler } from '../application/fijar-nivel-por-test/fijar-nivel-por-test.handler'
import { ObtenerPerfilHandler } from '../application/obtener-perfil/obtener-perfil.handler'
import { SubirNivelPorCursoHandler } from '../application/subir-nivel/subir-nivel.handler'
import type { Config } from './config/config'
import { crearRouter } from './in/http/routes'
import { crearProcesador } from './in/messaging/sqs.consumer'
import { crearPublisher } from './out/eventbridge-event.publisher'
import { DrizzleUsuarioRepository } from './out/persistencia/usuario.repository.drizzle'
import { aplicarMigraciones, crearDb, crearPool, type Db } from './out/persistencia/db'

export type App = {
  http: Express
  poller: SqsPoller | null
  db: Db
  cerrar: () => Promise<void>
}

export const construirApp = async (cfg: Config, carpetaMigraciones: string): Promise<App> => {
  const pool = await crearPool(cfg)
  const db = crearDb(pool)
  await aplicarMigraciones(db, carpetaMigraciones)

  const publisher = crearPublisher(cfg)
  const usuarios = new DrizzleUsuarioRepository(db)

  const bus = new CommandBus()
  bus.register(new CrearUsuarioHandler(usuarios, publisher))
  bus.register(new ActualizarPerfilHandler(usuarios, publisher))
  bus.register(new SubirNivelPorCursoHandler(usuarios, publisher))
  bus.register(new FijarNivelPorTestHandler(usuarios, publisher))

  const queries = new QueryBus()
  queries.register(new ObtenerPerfilHandler(usuarios, publisher))

  const http = express()
  http.use(requestContextMiddleware)
  http.use(xrayMiddleware('identity-access'))
  http.get('/health', (_req, res) => {
    res.json({ ok: true, servicio: 'identity-access' })
  })
  http.get('/ready', async (_req, res) => {
    const r = await db.execute('select 1').then(
      () => true,
      () => false,
    )
    res.status(r ? 200 : 503).json({ listo: r })
  })
  http.use('/api/identity', crearRouter(bus, queries, cfg))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)

  const sqs = crearSqsClient({ region: cfg.region, endpoint: cfg.awsEndpoint })
  const poller = cfg.colaUrl
    ? new SqsPoller(sqs, { queueUrl: cfg.colaUrl, procesar: crearProcesador(db, bus) })
    : null
  return {
    http,
    poller,
    db,
    cerrar: async () => {
      poller?.detener()
      await pool.end()
    },
  }
}
