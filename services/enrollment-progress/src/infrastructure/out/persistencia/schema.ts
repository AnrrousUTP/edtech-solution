import {
  boolean,
  char,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

const enrollment = pgSchema('enrollment')
export const estadoIntento = enrollment.enum('estado_intento', ['EN_CURSO', 'ENTREGADO'])
export const estadoMatricula = enrollment.enum('estado_matricula', [
  'ACTIVA',
  'REVOCADA',
  'EXPIRADA',
])
export const origenMatricula = enrollment.enum('origen_matricula', [
  'PAGO',
  'ALTA_MANUAL',
  'GRATUITO',
])
export const tipoEvaluacion = enrollment.enum('tipo_evaluacion', [
  'NIVELACION',
  'TOMO',
  'DIAGNOSTICO_PREVIO',
])

export const matriculas = enrollment.table('matriculas', {
  id: uuid('id').primaryKey(),
  usuarioId: uuid('usuario_id').notNull(),
  cursoId: uuid('curso_id').notNull(),
  estado: estadoMatricula('estado').notNull(),
  origen: origenMatricula('origen').notNull(),
  ordenId: uuid('orden_id'),
  accesoHasta: timestamp('acceso_hasta', { withTimezone: true }),
  cursoCompletadoAt: timestamp('curso_completado_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
})
export const processedEvents = enrollment.table('processed_events', {
  eventId: uuid('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  resultado: text('resultado').notNull(),
})
export const progresoLecciones = enrollment.table('progreso_lecciones', {
  matriculaId: uuid('matricula_id').notNull(),
  leccionId: uuid('leccion_id').notNull(),
  tomoId: uuid('tomo_id').notNull(),
  completadaAt: timestamp('completada_at', { withTimezone: true }),
})
export const progresoTomos = enrollment.table('progreso_tomos', {
  matriculaId: uuid('matricula_id').notNull(),
  tomoId: uuid('tomo_id').notNull(),
  completadoAt: timestamp('completado_at', { withTimezone: true }),
  mejorPuntaje: integer('mejor_puntaje'),
})
export const intentosEvaluacion = enrollment.table('intentos_evaluacion', {
  id: uuid('id').primaryKey(),
  usuarioId: uuid('usuario_id').notNull(),
  tipo: tipoEvaluacion('tipo').notNull(),
  bancoId: uuid('banco_id').notNull(),
  matriculaId: uuid('matricula_id'),
  tomoId: uuid('tomo_id'),
  estado: estadoIntento('estado').notNull(),
  puntaje: integer('puntaje'),
  aprobado: boolean('aprobado'),
  nivelResultante: char('nivel_resultante', { length: 1 }),
  iniciadoAt: timestamp('iniciado_at', { withTimezone: true }),
  entregadoAt: timestamp('entregado_at', { withTimezone: true }),
})
export const respuestasIntento = enrollment.table('respuestas_intento', {
  intentoId: uuid('intento_id').notNull(),
  preguntaId: uuid('pregunta_id').notNull(),
  respuesta: jsonb('respuesta').notNull(),
  correcta: boolean('correcta'),
})
