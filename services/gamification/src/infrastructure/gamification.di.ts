// Composition root: el ÚNICO archivo que instancia implementaciones concretas.
import {
  CommandBus,
  QueryBus,
  RelojSistema,
  SqsPoller,
  crearSqsClient,
  errorMiddleware,
  noEncontradoMiddleware,
  requestContextMiddleware,
} from '@edtech/shared-kernel'
import express, { type Express } from 'express'
import {
  MiPerfilHandler,
  VerificarCertificadoHandler,
} from '../application/consultar-gamificacion/consultar-gamificacion.handler'
import { GenerarPdfHandler } from '../application/generar-pdf/generar-pdf.handler'
import {
  OtorgarPorCarreraHandler,
  OtorgarPorCursoHandler,
} from '../application/otorgar-por-curso/otorgar-por-curso.handler'
import {
  CrearPerfilHandler,
  OtorgarEvaluacionPerfectaHandler,
  RegistrarActividadHandler,
} from '../application/registrar-actividad/registrar-actividad.handler'
import type { Config } from './config/config'
import { crearRouter } from './in/http/routes'
import { crearProcesador } from './in/messaging/sqs.consumer'
import { crearPublisher } from './out/eventbridge-event.publisher'
import { PdfCertificadoGenerador } from './out/pdf.generador'
import { S3AlmacenPdf, SqsColaCertificados, crearS3Client } from './out/s3-pdf.almacen'
import {
  DrizzleCertificadoRepository,
  DrizzlePerfilRepository,
} from './out/persistencia/repositorios.drizzle'
import { aplicarMigraciones, crearDb, crearPool, type Db } from './out/persistencia/db'

export type App = {
  http: Express
  poller: SqsPoller | null
  workerCertificados: SqsPoller | null
  db: Db
  cerrar: () => Promise<void>
}

export const construirApp = async (cfg: Config, carpetaMigraciones: string): Promise<App> => {
  const pool = await crearPool(cfg)
  const db = crearDb(pool)
  await aplicarMigraciones(db, carpetaMigraciones)

  const publisher = crearPublisher(cfg)
  const s3 = crearS3Client({ region: cfg.region, endpoint: cfg.awsEndpoint })
  const sqs = crearSqsClient({ region: cfg.region, endpoint: cfg.awsEndpoint })

  const perfiles = new DrizzlePerfilRepository(db)
  const certificados = new DrizzleCertificadoRepository(db)
  const almacen = new S3AlmacenPdf(s3, cfg.bucketMedia)
  const cola = new SqsColaCertificados(sqs, cfg.colaCertificadosUrl ?? '')
  const reloj = new RelojSistema()
  const aleatorio = (): number => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32

  const bus = new CommandBus()
  bus.register(
    new OtorgarPorCursoHandler(perfiles, certificados, cola, publisher, reloj, aleatorio),
  )
  bus.register(
    new OtorgarPorCarreraHandler(perfiles, certificados, cola, publisher, reloj, aleatorio),
  )
  bus.register(new RegistrarActividadHandler(perfiles, publisher, reloj))
  bus.register(new CrearPerfilHandler(perfiles))
  bus.register(new OtorgarEvaluacionPerfectaHandler(perfiles, publisher, reloj))
  bus.register(new GenerarPdfHandler(certificados, new PdfCertificadoGenerador(), almacen))

  const queries = new QueryBus()
  queries.register(new MiPerfilHandler(perfiles, certificados))
  queries.register(new VerificarCertificadoHandler(certificados, almacen))

  const http = express()
  http.use(requestContextMiddleware)
  http.get('/health', (_req, res) => {
    res.json({ ok: true, servicio: 'gamification' })
  })
  http.get('/ready', async (_req, res) => {
    const listo = await db.execute('select 1').then(
      () => true,
      () => false,
    )
    res.status(listo ? 200 : 503).json({ listo })
  })
  http.use('/api/gamification', crearRouter(bus, queries, cfg))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)

  const procesar = crearProcesador(db, bus)
  const poller = cfg.colaUrl ? new SqsPoller(sqs, { queueUrl: cfg.colaUrl, procesar }) : null
  // Worker del PDF: cola interna aparte, porque tarda segundos (doc 05 §1)
  const workerCertificados = cfg.colaCertificadosUrl
    ? new SqsPoller(sqs, { queueUrl: cfg.colaCertificadosUrl, procesar })
    : null

  return {
    http,
    poller,
    workerCertificados,
    db,
    cerrar: async () => {
      poller?.detener()
      workerCertificados?.detener()
      await pool.end()
    },
  }
}
