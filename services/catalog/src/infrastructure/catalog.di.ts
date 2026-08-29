// Composition root: el ÚNICO archivo que instancia implementaciones concretas.
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  crearSecretsClient,
  errorMiddleware,
  leerSecreto,
  noEncontradoMiddleware,
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import express, { type Express } from 'express'
import { ActualizarContenidoHandler } from '../application/actualizar-contenido/actualizar-contenido.handler'
import { ActualizarCursoHandler } from '../application/actualizar-curso/actualizar-curso.handler'
import {
  ListarCarrerasHandler,
  ListarCursosHandler,
  ObtenerCursoHandler,
} from '../application/consultar-catalogo/consultar-catalogo.handler'
import {
  ObtenerEvaluacionHandler,
  ObtenerLeccionHandler,
  ObtenerNivelacionHandler,
  ObtenerRespuestasHandler,
} from '../application/consultar-contenido/consultar-contenido.handler'
import { CrearCursoHandler } from '../application/crear-curso/crear-curso.handler'
import { DespublicarCursoHandler } from '../application/despublicar-curso/despublicar-curso.handler'
import { GestionarBancoHandler } from '../application/gestionar-banco/gestionar-banco.handler'
import { GestionarCarreraHandler } from '../application/gestionar-carrera/gestionar-carrera.handler'
import { PublicarCursoHandler } from '../application/publicar-curso/publicar-curso.handler'
import type { Config } from './config/config'
import { crearRouter } from './in/http/routes'
import { crearPublisher } from './out/eventbridge-event.publisher'
import { S3ContenidoStore, crearS3Client } from './out/s3-contenido.store'
import {
  DrizzleBancoRepository,
  DrizzleCarreraRepository,
} from './out/persistencia/carrera-banco.repository.drizzle'
import { DrizzleCatalogoLectura } from './out/persistencia/catalogo-lectura.drizzle'
import { DrizzleCursoRepository } from './out/persistencia/curso.repository.drizzle'
import { aplicarMigraciones, crearDb, crearPool, type Db } from './out/persistencia/db'

export type App = {
  http: Express
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
  const contenidoStore = new S3ContenidoStore(
    crearS3Client({ region: cfg.region, endpoint: cfg.awsEndpoint }),
    cfg.bucketMedia,
  )
  const cursos = new DrizzleCursoRepository(db)
  const carreras = new DrizzleCarreraRepository(db)
  const bancos = new DrizzleBancoRepository(db)
  const lectura = new DrizzleCatalogoLectura(db)
  const reloj = new RelojSistema()

  const bus = new CommandBus()
  bus.register(new CrearCursoHandler(cursos))
  bus.register(new ActualizarCursoHandler(cursos, publisher))
  bus.register(new ActualizarContenidoHandler(cursos, contenidoStore, publisher))
  bus.register(new PublicarCursoHandler(cursos, contenidoStore, publisher, reloj))
  bus.register(new DespublicarCursoHandler(cursos, publisher))
  bus.register(new GestionarCarreraHandler(carreras))
  bus.register(new GestionarBancoHandler(bancos))

  const queries = new QueryBus()
  queries.register(new ListarCursosHandler(lectura))
  queries.register(new ObtenerCursoHandler(lectura))
  queries.register(new ListarCarrerasHandler(lectura))
  queries.register(new ObtenerLeccionHandler(lectura))
  queries.register(new ObtenerEvaluacionHandler(lectura))
  queries.register(new ObtenerNivelacionHandler(lectura))
  queries.register(new ObtenerRespuestasHandler(lectura))

  const http = express()
  http.use(requestContextMiddleware)
  http.get('/health', (_req, res) => {
    res.json({ ok: true, servicio: 'catalog' })
  })
  http.get('/ready', async (_req, res) => {
    const listo = await db.execute('select 1').then(
      () => true,
      () => false,
    )
    res.status(listo ? 200 : 503).json({ listo })
  })
  http.use('/api/catalog', crearRouter(bus, queries, cfg, internoToken))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)

  return {
    http,
    db,
    cerrar: async () => {
      await pool.end()
    },
  }
}
