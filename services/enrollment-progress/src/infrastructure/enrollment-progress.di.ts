// Composition root: el ÚNICO archivo que instancia implementaciones concretas.
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  SqsPoller,
  crearSecretsClient,
  crearSqsClient,
  errorMiddleware,
  leerSecreto,
  noEncontradoMiddleware,
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import express, { type Express } from 'express'
import {
  ActualizarTomoProyeccionHandler,
  DespublicarProyeccionHandler,
  ProyectarCursoHandler,
} from '../application/actualizar-proyeccion/actualizar-proyeccion.handler'
import { CompletarLeccionHandler } from '../application/completar-leccion/completar-leccion.handler'
import {
  MisMatriculasHandler,
  ProgresoCursoHandler,
} from '../application/consultar-progreso/consultar-progreso.handler'
import {
  CrearMatriculaHandler,
  RevocarMatriculaHandler,
} from '../application/crear-matricula/crear-matricula.handler'
import {
  EntregarIntentoHandler,
  IniciarIntentoHandler,
} from '../application/gestionar-intento/gestionar-intento.handler'
import type { Config } from './config/config'
import { crearRouter } from './in/http/routes'
import { crearProcesador } from './in/messaging/sqs.consumer'
import { CatalogCarrerasGateway, CatalogRespuestasGateway } from './out/catalog-http.gateway'
import { crearPublisher } from './out/eventbridge-event.publisher'
import {
  DrizzleCursoProyeccionRepository,
  DrizzleIntentoRepository,
} from './out/persistencia/intento-proyeccion.repository.drizzle'
import { DrizzleMatriculaRepository } from './out/persistencia/matricula.repository.drizzle'
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

  let internoToken = cfg.internoToken ?? 'local-interno'
  if (cfg.internoTokenSecretName) {
    const secretos = crearSecretsClient({ region: cfg.region, endpoint: cfg.awsEndpoint })
    internoToken = (await leerSecreto(secretos, cfg.internoTokenSecretName)).token ?? internoToken
  }

  const publisher = crearPublisher(cfg)
  const matriculas = new DrizzleMatriculaRepository(db)
  const intentos = new DrizzleIntentoRepository(db)
  const proyeccion = new DrizzleCursoProyeccionRepository(db)
  const respuestas = new CatalogRespuestasGateway(cfg.catalogBaseUrl, internoToken)
  const carreras = new CatalogCarrerasGateway(cfg.catalogBaseUrl)
  const reloj = new RelojSistema()

  const bus = new CommandBus()
  bus.register(new CrearMatriculaHandler(matriculas, proyeccion, publisher))
  bus.register(new RevocarMatriculaHandler(matriculas))
  bus.register(new CompletarLeccionHandler(matriculas, proyeccion, carreras, publisher, reloj))
  bus.register(new IniciarIntentoHandler(intentos, matriculas, proyeccion, reloj))
  bus.register(
    new EntregarIntentoHandler(
      intentos,
      matriculas,
      proyeccion,
      respuestas,
      carreras,
      publisher,
      reloj,
    ),
  )
  bus.register(new ProyectarCursoHandler(proyeccion))
  bus.register(new DespublicarProyeccionHandler(proyeccion))
  bus.register(new ActualizarTomoProyeccionHandler(proyeccion))

  const queries = new QueryBus()
  queries.register(new MisMatriculasHandler(matriculas, proyeccion))
  queries.register(new ProgresoCursoHandler(matriculas, proyeccion))

  const http = express()
  http.use(requestContextMiddleware)
  http.get('/health', (_req, res) => {
    res.json({ ok: true, servicio: 'enrollment-progress' })
  })
  http.get('/ready', async (_req, res) => {
    const listo = await db.execute('select 1').then(
      () => true,
      () => false,
    )
    res.status(listo ? 200 : 503).json({ listo })
  })
  http.use('/api/enrollment', crearRouter(bus, queries, cfg))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)

  let poller: SqsPoller | null = null
  if (cfg.colaUrl) {
    poller = new SqsPoller(crearSqsClient({ region: cfg.region, endpoint: cfg.awsEndpoint }), {
      queueUrl: cfg.colaUrl,
      procesar: crearProcesador(db, bus),
    })
  }

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
