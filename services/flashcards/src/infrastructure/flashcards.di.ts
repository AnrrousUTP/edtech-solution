// Composition root: el ÚNICO archivo que instancia implementaciones concretas.
// Es también donde `GENERADOR_FLASHCARDS` decide fake vs Bedrock: el código no
// tiene ramas `if (esLocal)` (doc 13 §4).
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
  MazosDeTomoAdminHandler,
  TarjetasDeTomoHandler,
} from '../application/consultar-mazos/consultar-mazos.handler'
import { GenerarMazoHandler } from '../application/generar-mazo/generar-mazo.handler'
import {
  AprobarTarjetaHandler,
  RechazarTarjetaHandler,
} from '../application/revisar-tarjetas/revisar-tarjetas.handler'
import { SolicitarGeneracionHandler } from '../application/solicitar-generacion/solicitar-generacion.handler'
import type { GeneradorFlashcardsPort } from '../domain/ports-out/generador-flashcards.port'
import type { Config } from './config/config'
import { crearRouter } from './in/http/routes'
import { crearProcesador } from './in/messaging/sqs.consumer'
import { BedrockGeneradorFlashcards, crearBedrockClient } from './out/bedrock-generador.flashcards'
import { crearPublisher } from './out/eventbridge-event.publisher'
import { FakeGeneradorFlashcards } from './out/fake-generador.flashcards'
import { S3ContenidoFuente, SqsColaGeneracion, crearS3Client } from './out/s3-contenido.fuente'
import { DrizzleMazoRepository } from './out/persistencia/mazo.repository.drizzle'
import { aplicarMigraciones, crearDb, crearPool, type Db } from './out/persistencia/db'

export type App = {
  http: Express
  poller: SqsPoller | null
  workerGeneracion: SqsPoller | null
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

  const mazos = new DrizzleMazoRepository(db)
  const contenido = new S3ContenidoFuente(s3)
  const cola = new SqsColaGeneracion(sqs, cfg.colaGeneracionUrl ?? '')
  const reloj = new RelojSistema()

  const generador: GeneradorFlashcardsPort =
    cfg.generador === 'bedrock'
      ? new BedrockGeneradorFlashcards(
          crearBedrockClient({ region: cfg.region }),
          cfg.bedrock.agentId,
          cfg.bedrock.agentAliasId,
          cfg.bedrock.modeloDeclarado,
        )
      : new FakeGeneradorFlashcards()

  const bus = new CommandBus()
  bus.register(new SolicitarGeneracionHandler(mazos, cola))
  bus.register(new GenerarMazoHandler(mazos, generador, contenido, publisher, reloj))
  bus.register(new AprobarTarjetaHandler(mazos, publisher, reloj))
  bus.register(new RechazarTarjetaHandler(mazos, publisher, reloj))

  const queries = new QueryBus()
  queries.register(new TarjetasDeTomoHandler(mazos))
  queries.register(new MazosDeTomoAdminHandler(mazos))

  const http = express()
  http.use(requestContextMiddleware)
  http.get('/health', (_req, res) => {
    res.json({ ok: true, servicio: 'flashcards', generador: cfg.generador })
  })
  http.get('/ready', async (_req, res) => {
    const listo = await db.execute('select 1').then(
      () => true,
      () => false,
    )
    res.status(listo ? 200 : 503).json({ listo })
  })
  http.use('/api/flashcards', crearRouter(bus, queries, cfg))
  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)

  const procesar = crearProcesador(db, bus)
  const poller = cfg.colaUrl ? new SqsPoller(sqs, { queueUrl: cfg.colaUrl, procesar }) : null
  // Dos colas y no una: Bedrock tarda decenas de segundos (doc 10 §1)
  const workerGeneracion = cfg.colaGeneracionUrl
    ? new SqsPoller(sqs, { queueUrl: cfg.colaGeneracionUrl, procesar })
    : null

  return {
    http,
    poller,
    workerGeneracion,
    db,
    cerrar: async () => {
      poller?.detener()
      workerGeneracion?.detener()
      await pool.end()
    },
  }
}
