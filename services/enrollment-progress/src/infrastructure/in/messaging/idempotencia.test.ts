// I-2 con Postgres real (doc 12 §5, "Mensajería"): entregar el MISMO evento dos
// veces produce un solo efecto. Se salta solo si el compose no está arriba.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { CommandBus, type SobreEvento } from '@edtech/shared-kernel'
import { InMemoryEventPublisher } from '@edtech/shared-kernel/testing'
import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { crearProcesador } from './sqs.consumer'
import { CrearMatriculaHandler } from '../../../application/crear-matricula/crear-matricula.handler'
import { ProyectarCursoHandler } from '../../../application/actualizar-proyeccion/actualizar-proyeccion.handler'
import { DrizzleMatriculaRepository } from '../../out/persistencia/matricula.repository.drizzle'
import { DrizzleCursoProyeccionRepository } from '../../out/persistencia/intento-proyeccion.repository.drizzle'
import { aplicarMigraciones, crearDb, type Db } from '../../out/persistencia/db'
import { matriculas, processedEvents } from '../../out/persistencia/schema'
import pg from 'pg'

const DATABASE_URL = 'postgres://svc_enrollment:local@localhost:5432/edtech'

const hayPostgres = await new pg.Pool({ connectionString: DATABASE_URL, max: 1 })
  .query('select 1')
  .then(() => true)
  .catch(() => false)

const sobre = (
  eventType: string,
  payload: Record<string, unknown>,
  eventId = crypto.randomUUID(),
): SobreEvento => ({
  eventId,
  eventType,
  occurredAt: new Date().toISOString(),
  aggregateId: crypto.randomUUID(),
  correlationId: 'test-idempotencia',
  payload,
})

describe.skipIf(!hayPostgres)('I-2: idempotencia del consumidor SQS', () => {
  let pool: pg.Pool
  let db: Db
  let procesar: (s: SobreEvento) => Promise<'ACK' | 'NACK'>
  let publisher: InMemoryEventPublisher

  const USUARIO = crypto.randomUUID()
  const CURSO = crypto.randomUUID()
  const ORDEN = crypto.randomUUID()

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 })
    db = crearDb(pool)
    await aplicarMigraciones(db, join(import.meta.dir, '../../../../migrations'))

    publisher = new InMemoryEventPublisher()
    const repoMatriculas = new DrizzleMatriculaRepository(db)
    const proyeccion = new DrizzleCursoProyeccionRepository(db)
    const bus = new CommandBus()
    bus.register(new CrearMatriculaHandler(repoMatriculas, proyeccion, publisher))
    bus.register(new ProyectarCursoHandler(proyeccion))
    procesar = crearProcesador(db, bus)
  })

  afterAll(async () => {
    await db.delete(matriculas).where(eq(matriculas.usuarioId, USUARIO))
    await pool.end()
  })

  test('el MISMO pago-confirmado dos veces deja UNA matrícula', async () => {
    const evento = sobre('payments.pago-confirmado.v1', {
      ordenId: ORDEN,
      usuarioId: USUARIO,
      cursoId: CURSO,
      monto: 19.9,
      moneda: 'USD',
      capturaId: 'CAP-1',
      confirmadoAt: new Date().toISOString(),
    })

    expect(await procesar(evento)).toBe('ACK')
    expect(await procesar(evento)).toBe('ACK') // reentrega de SQS: mismo eventId

    const filas = await db.select().from(matriculas).where(eq(matriculas.usuarioId, USUARIO))
    expect(filas).toHaveLength(1)
    expect(filas[0]?.origen).toBe('PAGO')
    expect(publisher.porTipo('enrollment.matricula-creada.v1')).toHaveLength(1)
  })

  test('processed_events registra el evento una sola vez', async () => {
    const eventId = crypto.randomUUID()
    const evento = sobre(
      'payments.pago-confirmado.v1',
      {
        ordenId: crypto.randomUUID(),
        usuarioId: USUARIO,
        cursoId: crypto.randomUUID(),
        monto: 0,
        moneda: 'USD',
        capturaId: 'CAP-2',
        confirmadoAt: new Date().toISOString(),
      },
      eventId,
    )
    await procesar(evento)
    await procesar(evento)

    const filas = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.eventId, eventId))
    expect(filas).toHaveLength(1)
    expect(filas[0]?.resultado).toBe('OK')
  })

  test('un evento sin handler se ACKea (no ensucia la DLQ)', async () => {
    expect(await procesar(sobre('gamification.insignia-otorgada.v1', {}))).toBe('ACK')
  })

  test('un pago para un curso distinto sí crea otra matrícula (no sobre-deduplica)', async () => {
    const otroCurso = crypto.randomUUID()
    await procesar(
      sobre('payments.pago-confirmado.v1', {
        ordenId: crypto.randomUUID(),
        usuarioId: USUARIO,
        cursoId: otroCurso,
        monto: 29.9,
        moneda: 'USD',
        capturaId: 'CAP-3',
        confirmadoAt: new Date().toISOString(),
      }),
    )
    const filas = await db.select().from(matriculas).where(eq(matriculas.usuarioId, USUARIO))
    expect(filas.length).toBeGreaterThanOrEqual(2)
  })
})
