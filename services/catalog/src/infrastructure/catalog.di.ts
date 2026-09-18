import {
  crearEventBridgeClient,
  EventBridgePublisher,
  errorMiddleware,
  noEncontradoMiddleware,
  requiereAuth,
  requiereRol,
  requestContextMiddleware,
  xrayMiddleware,
  type IEventPublisher,
} from '@edtech/shared-kernel'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createHash, randomUUID } from 'node:crypto'
import express, { type Express, type Request, type Response } from 'express'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import type { Config } from './config/config'
import { ContenidoActualizadoEvent } from '../domain/events/contenido-actualizado.event'
import { CursoDespublicadoEvent } from '../domain/events/curso-despublicado.event'
import { CursoPublicadoEvent } from '../domain/events/curso-publicado.event'
import { PrecioActualizadoEvent } from '../domain/events/precio-actualizado.event'

type Db = { query: Pool['query']; execute: (sql: string) => Promise<unknown> }
type CursoRow = {
  id: string
  slug: string
  titulo: string
  descripcion: string
  tecnologia: string
  nivel_min: string
  nivel_max: string
  precio: string | number
  moneda: string
  version_precio: number
  imagen_url: string | null
  estado: string
  publicado_at: Date | string | null
}

const resumen = (row: CursoRow) => ({
  id: row.id,
  slug: row.slug,
  titulo: row.titulo,
  descripcion: row.descripcion,
  tecnologia: row.tecnologia,
  nivelMin: row.nivel_min,
  nivelMax: row.nivel_max,
  precio: Number(row.precio),
  moneda: row.moneda,
  imagenUrl: row.imagen_url,
  estado: row.estado,
  publicadoAt: row.publicado_at ? new Date(row.publicado_at).toISOString() : null,
})
const responder = (res: Response, data: unknown, status = 200): void => {
  res.status(status).json({ data })
}
const idOrSlug = (value: string): { field: 'id' | 'slug'; value: string } =>
  /^[0-9a-f-]{36}$/i.test(value) ? { field: 'id', value } : { field: 'slug', value }
const body = (req: Request): Record<string, unknown> => (req.body ?? {}) as Record<string, unknown>
type UsoBancoAdmin =
  'DIAGNOSTICO_PREVIO' | 'EVALUACION_INICIAL' | 'NIVELACION' | 'EVALUACION_TOMO' | 'REFUERZO'

const validarBancoAdmin = (
  uso: string,
  tomoId: string | null,
  cursoId: string | null,
): string | null => {
  if (
    !(
      [
        'DIAGNOSTICO_PREVIO',
        'EVALUACION_INICIAL',
        'NIVELACION',
        'EVALUACION_TOMO',
        'REFUERZO',
      ] as string[]
    ).includes(uso)
  )
    return 'El uso del banco no es válido'
  if ((uso === 'REFUERZO' || uso === 'EVALUACION_TOMO') && !tomoId)
    return 'Los bancos de refuerzo y examen necesitan un tomo'
  if (uso === 'NIVELACION' && tomoId) return 'Los bancos de nivelación deben ser globales'
  if (uso === 'DIAGNOSTICO_PREVIO' && (tomoId || cursoId))
    return 'El diagnóstico general debe ser global'
  if (uso === 'EVALUACION_INICIAL' && (!cursoId || tomoId))
    return 'El test inicial necesita un curso y no un tomo'
  if (uso !== 'EVALUACION_INICIAL' && cursoId) return 'Solo el test inicial se asigna a un curso'
  return null
}

const migrar = async (pool: Pool, carpeta: string): Promise<void> => {
  const sql = await readFile(`${carpeta}/0000_init.sql`, 'utf8')
  for (const sentencia of sql
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(Boolean)) {
    try {
      await pool.query(sentencia)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== '42710' && code !== '42P07' && code !== '42701') throw error
    }
  }
}

const listarCursos = async (db: Db, todos: boolean): Promise<unknown[]> => {
  const filtro = todos ? '' : "AND estado = 'PUBLICADO'"
  const { rows } =
    await db.query(`SELECT id, slug, titulo, descripcion, tecnologia, nivel_min, nivel_max,
    precio, moneda, version_precio, imagen_url, estado, publicado_at FROM catalog.cursos
    WHERE deleted_at IS NULL ${filtro} ORDER BY created_at, id`)
  return rows.map(resumen)
}

const detalleCurso = async (db: Db, slugOId: string, todos: boolean): Promise<unknown | null> => {
  const clave = idOrSlug(slugOId)
  const filtro = todos ? '' : "AND c.estado = 'PUBLICADO'"
  const r = await db.query(
    `SELECT c.id, c.slug, c.titulo, c.descripcion, c.tecnologia, c.nivel_min,
    c.nivel_max, c.precio, c.moneda, c.version_precio, c.imagen_url, c.estado, c.publicado_at
    FROM catalog.cursos c WHERE c.${clave.field} = $1 AND c.deleted_at IS NULL ${filtro} LIMIT 1`,
    [clave.value],
  )
  const curso = r.rows[0] as CursoRow | undefined
  if (!curso) return null
  const tomosR = await db.query(
    `SELECT id, orden, titulo, descripcion, umbral_aprobacion FROM catalog.tomos WHERE curso_id = $1 ORDER BY orden`,
    [curso.id],
  )
  const tomos = []
  for (const tomo of tomosR.rows) {
    const materiales = await db.query(
      `SELECT id, orden, titulo, descripcion, tipo, url FROM catalog.materiales WHERE tomo_id = $1 ORDER BY orden`,
      [tomo.id],
    )
    const lecciones = await db.query(
      `SELECT id, orden, titulo, duracion_min FROM catalog.lecciones WHERE tomo_id = $1 ORDER BY orden`,
      [tomo.id],
    )
    tomos.push({
      id: tomo.id,
      orden: tomo.orden,
      titulo: tomo.titulo,
      descripcion: tomo.descripcion,
      umbral: tomo.umbral_aprobacion,
      materiales: materiales.rows,
      lecciones: lecciones.rows.map(l => ({
        id: l.id,
        orden: l.orden,
        titulo: l.titulo,
        duracionMin: l.duracion_min,
      })),
    })
  }
  return { ...resumen(curso), versionPrecio: curso.version_precio, tomos }
}

const contenidoAdmin = async (db: Db, leccionId: string): Promise<unknown | null> => {
  const r = await db.query(
    `SELECT l.id, l.titulo, l.tomo_id FROM catalog.lecciones l WHERE l.id = $1`,
    [leccionId],
  )
  const leccion = r.rows[0]
  if (!leccion) return null
  const bloques = await db.query(
    `SELECT orden, tipo, contenido FROM catalog.bloques WHERE leccion_id = $1 ORDER BY orden`,
    [leccionId],
  )
  const ejercicios = await db.query(
    `SELECT id, enunciado, solucion_esperada, pistas FROM catalog.ejercicios WHERE leccion_id = $1 ORDER BY id`,
    [leccionId],
  )
  return {
    id: leccion.id,
    titulo: leccion.titulo,
    tomoId: leccion.tomo_id,
    bloques: bloques.rows,
    ejercicios: ejercicios.rows.map(ejercicio => ({
      id: ejercicio.id,
      enunciado: ejercicio.enunciado,
      solucionEsperada: ejercicio.solucion_esperada,
      pistas: ejercicio.pistas,
    })),
  }
}

const bancosAdmin = async (db: Db): Promise<unknown[]> => {
  const bancos = await db.query(
    `SELECT id, uso, tomo_id, curso_id, titulo FROM catalog.bancos_pregunta ORDER BY titulo, id`,
  )
  const resultado = []
  for (const banco of bancos.rows) {
    const preguntas = await db.query(
      `SELECT id, tipo, nivel, enunciado, opciones, respuesta_correcta, puntaje
      FROM catalog.preguntas WHERE banco_id = $1 ORDER BY id`,
      [banco.id],
    )
    resultado.push({
      bancoId: banco.id,
      uso: banco.uso,
      tomoId: banco.tomo_id,
      cursoId: banco.curso_id,
      titulo: banco.titulo,
      preguntas: preguntas.rows.map(pregunta => ({
        id: pregunta.id,
        tipo: pregunta.tipo,
        nivel: pregunta.nivel,
        enunciado: pregunta.enunciado,
        opciones: pregunta.opciones,
        respuestaCorrecta: pregunta.respuesta_correcta,
        puntaje: pregunta.puntaje,
      })),
    })
  }
  return resultado
}

const listarCarreras = async (db: Db, todos: boolean): Promise<unknown[]> => {
  const filtro = todos ? '' : "AND ca.estado = 'PUBLICADO'"
  const { rows } =
    await db.query(`SELECT ca.id, ca.slug, ca.titulo, ca.descripcion, ca.imagen_url, ca.estado,
    cc.curso_id, cc.orden FROM catalog.carreras ca LEFT JOIN catalog.carrera_cursos cc
    ON cc.carrera_id = ca.id WHERE ca.deleted_at IS NULL ${filtro} ORDER BY ca.created_at, cc.orden`)
  const carreras = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const carrera = carreras.get(row.id) ?? {
      id: row.id,
      slug: row.slug,
      titulo: row.titulo,
      descripcion: row.descripcion,
      imagenUrl: row.imagen_url,
      estado: row.estado,
      cursos: [],
    }
    if (row.curso_id)
      (carrera.cursos as unknown[]).push({ cursoId: row.curso_id, orden: row.orden })
    carreras.set(row.id, carrera)
  }
  return [...carreras.values()]
}

const contenido = async (db: Db, leccionId: string): Promise<unknown | null> => {
  const r = await db.query(
    `SELECT l.id, l.titulo, l.tomo_id FROM catalog.lecciones l
    JOIN catalog.tomos t ON t.id = l.tomo_id JOIN catalog.cursos c ON c.id = t.curso_id
    WHERE l.id = $1 AND c.estado = 'PUBLICADO'`,
    [leccionId],
  )
  const l = r.rows[0]
  if (!l) return null
  const bloques = await db.query(
    `SELECT orden, tipo, contenido FROM catalog.bloques WHERE leccion_id = $1 ORDER BY orden`,
    [leccionId],
  )
  const ejercicios = await db.query(
    `SELECT id, enunciado, pistas FROM catalog.ejercicios WHERE leccion_id = $1 ORDER BY id`,
    [leccionId],
  )
  return {
    id: l.id,
    titulo: l.titulo,
    tomoId: l.tomo_id,
    bloques: bloques.rows,
    ejercicios: ejercicios.rows,
  }
}

const evaluacionPorUso = async (
  db: Db,
  tomoId: string,
  uso: 'EVALUACION_TOMO' | 'REFUERZO',
): Promise<unknown | null> => {
  const r = await db.query(
    `SELECT b.id, b.titulo, t.umbral_aprobacion AS umbral FROM catalog.bancos_pregunta b
    JOIN catalog.tomos t ON t.id = b.tomo_id JOIN catalog.cursos c ON c.id = t.curso_id
    WHERE b.tomo_id = $1 AND b.uso = $2 AND c.estado = 'PUBLICADO' LIMIT 1`,
    [tomoId, uso],
  )
  const banco = r.rows[0]
  if (!banco) return null
  const preguntas = await db.query(
    `SELECT id, tipo, enunciado, opciones, puntaje FROM catalog.preguntas WHERE banco_id = $1 ORDER BY id`,
    [banco.id],
  )
  return {
    bancoId: banco.id,
    titulo: banco.titulo,
    umbral: banco.umbral,
    preguntas: preguntas.rows,
  }
}

const evaluacion = async (db: Db, tomoId: string): Promise<unknown | null> =>
  evaluacionPorUso(db, tomoId, 'EVALUACION_TOMO')
const refuerzo = async (db: Db, tomoId: string): Promise<unknown | null> =>
  evaluacionPorUso(db, tomoId, 'REFUERZO')

const contextoTomo = async (db: Db, tomoId: string): Promise<unknown | null> => {
  const r = await db.query(
    `SELECT c.id AS curso_id, c.slug AS curso_slug, c.titulo AS curso_titulo,
    t.id AS tomo_id, t.titulo AS tomo_titulo
    FROM catalog.tomos t JOIN catalog.cursos c ON c.id = t.curso_id
    WHERE t.id = $1 AND c.estado = 'PUBLICADO' AND c.deleted_at IS NULL LIMIT 1`,
    [tomoId],
  )
  const fila = r.rows[0]
  if (!fila) return null
  return {
    cursoId: fila.curso_id,
    cursoSlug: fila.curso_slug,
    cursoTitulo: fila.curso_titulo,
    tomoId: fila.tomo_id,
    tomoTitulo: fila.tomo_titulo,
  }
}

const diagnostico = async (db: Db): Promise<unknown | null> => {
  const r = await db.query(`SELECT id, titulo FROM catalog.bancos_pregunta
    WHERE uso = 'DIAGNOSTICO_PREVIO' ORDER BY id LIMIT 1`)
  const banco = r.rows[0]
  if (!banco) return null
  const preguntas = await db.query(
    `SELECT id, tipo, enunciado, opciones, puntaje
    FROM catalog.preguntas WHERE banco_id = $1 ORDER BY id`,
    [banco.id],
  )
  return { bancoId: banco.id, titulo: banco.titulo, umbral: 60, preguntas: preguntas.rows }
}

const evaluacionInicial = async (db: Db, cursoId: string): Promise<unknown | null> => {
  const r = await db.query(
    `SELECT b.id, b.titulo FROM catalog.bancos_pregunta b
    JOIN catalog.cursos c ON c.id = b.curso_id
    WHERE b.uso = 'EVALUACION_INICIAL' AND b.curso_id = $1 AND c.estado = 'PUBLICADO' LIMIT 1`,
    [cursoId],
  )
  const banco = r.rows[0]
  if (!banco) return null
  const preguntas = await db.query(
    `SELECT id, tipo, enunciado, opciones, puntaje
    FROM catalog.preguntas WHERE banco_id = $1 ORDER BY id`,
    [banco.id],
  )
  return { bancoId: banco.id, titulo: banco.titulo, umbral: 60, preguntas: preguntas.rows }
}

const nivelacion = async (db: Db): Promise<unknown | null> => {
  const r = await db.query(`SELECT id, titulo FROM catalog.bancos_pregunta
    WHERE uso = 'NIVELACION' ORDER BY id LIMIT 1`)
  const banco = r.rows[0]
  if (!banco) return null
  const preguntas = await db.query(
    `SELECT id, tipo, enunciado, opciones, puntaje
    FROM catalog.preguntas WHERE banco_id = $1 ORDER BY id`,
    [banco.id],
  )
  return { bancoId: banco.id, titulo: banco.titulo, umbral: 60, preguntas: preguntas.rows }
}

const respuestasBanco = async (db: Db, bancoId: string): Promise<unknown | null> => {
  const banco = await db.query(
    `SELECT b.id, b.uso, b.tomo_id, t.umbral_aprobacion AS umbral
    FROM catalog.bancos_pregunta b LEFT JOIN catalog.tomos t ON t.id = b.tomo_id
    WHERE b.id = $1 LIMIT 1`,
    [bancoId],
  )
  if (!banco.rows[0]) return null
  const preguntas = await db.query(
    `SELECT id, tipo, enunciado, opciones, respuesta_correcta, puntaje, nivel
    FROM catalog.preguntas WHERE banco_id = $1 ORDER BY id`,
    [bancoId],
  )
  return {
    bancoId: banco.rows[0].id,
    uso: banco.rows[0].uso,
    tomoId: banco.rows[0].tomo_id,
    umbral: banco.rows[0].umbral ?? 60,
    preguntas: preguntas.rows.map(p => ({
      id: p.id,
      tipo: p.tipo,
      enunciado: p.enunciado,
      opciones: p.opciones,
      respuestaCorrecta: p.respuesta_correcta,
      puntaje: p.puntaje,
      nivel: p.nivel,
    })),
  }
}

const estructuraCurso = async (
  db: Db,
  cursoId: string,
): Promise<{
  slug: string
  titulo: string
  tecnologia: string
  nivelMin: string
  nivelMax: string
  precio: number
  moneda: string
  versionPrecio: number
  estructura: {
    tomoId: string
    orden: number
    titulo: string
    umbral: number
    lecciones: { id: string; orden: number; titulo: string }[]
  }[]
} | null> => {
  const curso = await db.query(
    `SELECT slug, titulo, tecnologia, nivel_min, nivel_max, precio, moneda, version_precio
    FROM catalog.cursos WHERE id = $1 AND deleted_at IS NULL`,
    [cursoId],
  )
  if (!curso.rows[0]) return null
  const tomos = await db.query(
    `SELECT id, orden, titulo, umbral_aprobacion FROM catalog.tomos WHERE curso_id = $1 ORDER BY orden`,
    [cursoId],
  )
  const estructura = []
  for (const tomo of tomos.rows) {
    const lecciones = await db.query(
      `SELECT id, orden, titulo FROM catalog.lecciones WHERE tomo_id = $1 ORDER BY orden`,
      [tomo.id],
    )
    estructura.push({
      tomoId: tomo.id,
      orden: tomo.orden,
      titulo: tomo.titulo,
      umbral: tomo.umbral_aprobacion,
      lecciones: lecciones.rows.map(l => ({ id: l.id, orden: l.orden, titulo: l.titulo })),
    })
  }
  return {
    slug: curso.rows[0].slug,
    titulo: curso.rows[0].titulo,
    tecnologia: curso.rows[0].tecnologia,
    nivelMin: String(curso.rows[0].nivel_min).trim(),
    nivelMax: String(curso.rows[0].nivel_max).trim(),
    precio: Number(curso.rows[0].precio),
    moneda: curso.rows[0].moneda,
    versionPrecio: curso.rows[0].version_precio,
    estructura,
  }
}

const contenidoEventos = async (
  db: Db,
  s3: S3Client,
  bucket: string,
  cursoId: string,
): Promise<ContenidoActualizadoEvent[]> => {
  const tomos = await db.query(`SELECT id FROM catalog.tomos WHERE curso_id = $1 ORDER BY orden`, [
    cursoId,
  ])
  const eventos: ContenidoActualizadoEvent[] = []
  for (const tomo of tomos.rows) {
    const lecciones = await db.query(
      `SELECT id, titulo, contenido_hash FROM catalog.lecciones WHERE tomo_id = $1 ORDER BY orden`,
      [tomo.id],
    )
    const publicadas: { id: string; titulo: string; bloquesS3Key: string }[] = []
    const hashes: string[] = []
    for (const leccion of lecciones.rows) {
      const bloques = await db.query(
        `SELECT orden, tipo, contenido FROM catalog.bloques WHERE leccion_id = $1 ORDER BY orden`,
        [leccion.id],
      )
      const documento = JSON.stringify({
        leccionId: leccion.id,
        titulo: leccion.titulo,
        bloques: bloques.rows,
      })
      const hash = createHash('sha256').update(documento).digest('hex')
      const key = `catalog/lecciones/${leccion.id}/${hash}.json`
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: documento,
          ContentType: 'application/json',
        }),
      )
      publicadas.push({ id: leccion.id, titulo: leccion.titulo, bloquesS3Key: key })
      hashes.push(String(leccion.contenido_hash))
    }
    const contenidoHash = createHash('sha256').update(hashes.join('|')).digest('hex')
    eventos.push(new ContenidoActualizadoEvent(cursoId, String(tomo.id), contenidoHash, publicadas))
  }
  return eventos
}

export type App = { http: Express; db: Db; cerrar: () => Promise<void> }

export const construirApp = async (cfg: Config, carpetaMigraciones: string): Promise<App> => {
  const pool = new Pool({ connectionString: cfg.db.url, max: 5 })
  await migrar(pool, carpetaMigraciones)
  const db: Db = { query: pool.query.bind(pool), execute: sql => pool.query(sql) }
  const publisher: IEventPublisher = new EventBridgePublisher(
    crearEventBridgeClient({
      region: cfg.region,
      ...(cfg.awsEndpoint ? { endpoint: cfg.awsEndpoint } : {}),
    }),
    cfg.busName,
  )
  const s3 = new S3Client({
    region: cfg.region,
    ...(cfg.awsEndpoint ? { endpoint: cfg.awsEndpoint, forcePathStyle: true } : {}),
  })
  const http = express()
  const authConfig = {
    issuer: cfg.cognito.issuer,
    ...(cfg.cognito.jwksUri ? { jwksUri: cfg.cognito.jwksUri } : {}),
  }
  http.use(requestContextMiddleware)
  http.use(xrayMiddleware('catalog'))
  http.use(express.json({ limit: '2mb' }))
  http.get('/health', (_req, res) => res.json({ ok: true, servicio: 'catalog' }))
  http.get('/ready', async (_req, res) =>
    db.execute('select 1').then(
      () => res.json({ listo: true }),
      () => res.status(503).json({ listo: false }),
    ),
  )

  http.get('/api/catalog/cursos', async (_req, res, next) => {
    try {
      responder(res, await listarCursos(db, false))
    } catch (e) {
      next(e)
    }
  })
  http.get('/api/catalog/cursos/:slugOId', async (req, res, next) => {
    try {
      const data = await detalleCurso(db, req.params.slugOId ?? '', false)
      data
        ? responder(res, data)
        : res
            .status(404)
            .json({ error: { code: 'CURSO_NO_ENCONTRADO', message: 'Curso no encontrado' } })
    } catch (e) {
      next(e)
    }
  })
  http.get('/api/catalog/carreras', async (_req, res, next) => {
    try {
      responder(res, await listarCarreras(db, false))
    } catch (e) {
      next(e)
    }
  })
  http.get('/api/catalog/nivelacion', async (_req, res, next) => {
    try {
      const data = await nivelacion(db)
      data
        ? responder(res, data)
        : res
            .status(404)
            .json({ error: { code: 'BANCO_NO_ENCONTRADO', message: 'Nivelación no disponible' } })
    } catch (e) {
      next(e)
    }
  })
  http.get('/api/catalog/diagnostico', async (_req, res, next) => {
    try {
      const data = await diagnostico(db)
      data
        ? responder(res, data)
        : res
            .status(404)
            .json({ error: { code: 'BANCO_NO_ENCONTRADO', message: 'Diagnóstico no disponible' } })
    } catch (e) {
      next(e)
    }
  })
  http.get('/api/catalog/cursos/:cursoId/evaluacion-inicial', async (req, res, next) => {
    try {
      const data = await evaluacionInicial(db, req.params.cursoId ?? '')
      data
        ? responder(res, data)
        : res
            .status(404)
            .json({
              error: { code: 'BANCO_NO_ENCONTRADO', message: 'Test inicial no configurado' },
            })
    } catch (e) {
      next(e)
    }
  })
  http.get('/api/catalog/interno/bancos/:id/respuestas', async (req, res, next) => {
    if (req.headers['x-interno-token'] !== (cfg.internoToken ?? 'local-interno')) {
      return res
        .status(401)
        .json({ error: { code: 'NO_AUTORIZADO', message: 'Token interno inválido' } })
    }
    try {
      const data = await respuestasBanco(db, req.params.id ?? '')
      return data
        ? responder(res, data)
        : res
            .status(404)
            .json({ error: { code: 'BANCO_NO_ENCONTRADO', message: 'Banco no encontrado' } })
    } catch (e) {
      return next(e)
    }
  })
  http.get('/api/catalog/lecciones/:id', requiereAuth(authConfig), async (req, res, next) => {
    try {
      const data = await contenido(db, req.params.id ?? '')
      data
        ? responder(res, data)
        : res
            .status(404)
            .json({ error: { code: 'LECCION_NO_ENCONTRADA', message: 'Lección no encontrada' } })
    } catch (e) {
      next(e)
    }
  })
  http.get(
    '/api/catalog/tomos/:id/evaluacion',
    requiereAuth(authConfig),
    async (req, res, next) => {
      try {
        const data = await evaluacion(db, req.params.id ?? '')
        data
          ? responder(res, data)
          : res
              .status(404)
              .json({ error: { code: 'BANCO_NO_ENCONTRADO', message: 'Evaluación no encontrada' } })
      } catch (e) {
        next(e)
      }
    },
  )
  http.get('/api/catalog/tomos/:id/refuerzo', requiereAuth(authConfig), async (req, res, next) => {
    try {
      const data = await refuerzo(db, req.params.id ?? '')
      data
        ? responder(res, data)
        : res
            .status(404)
            .json({ error: { code: 'BANCO_NO_ENCONTRADO', message: 'Refuerzo no encontrado' } })
    } catch (e) {
      next(e)
    }
  })
  http.get('/api/catalog/tomos/:id/contexto', async (req, res, next) => {
    try {
      const data = await contextoTomo(db, req.params.id ?? '')
      data
        ? responder(res, data)
        : res
            .status(404)
            .json({ error: { code: 'TOMO_NO_ENCONTRADO', message: 'Tomo no encontrado' } })
    } catch (e) {
      next(e)
    }
  })

  const admin = [requiereAuth(authConfig), requiereRol('admin')] as const
  http.get('/api/catalog/admin/cursos', ...admin, async (_req, res, next) => {
    try {
      responder(res, await listarCursos(db, true))
    } catch (e) {
      next(e)
    }
  })
  http.get('/api/catalog/admin/cursos/:slugOId', ...admin, async (req, res, next) => {
    try {
      const data = await detalleCurso(db, req.params.slugOId ?? '', true)
      data
        ? responder(res, data)
        : res
            .status(404)
            .json({ error: { code: 'CURSO_NO_ENCONTRADO', message: 'Curso no encontrado' } })
    } catch (e) {
      next(e)
    }
  })
  http.post('/api/catalog/admin/cursos/:id/publicar', ...admin, async (req, res, next) => {
    try {
      const id = req.params.id ?? ''
      const exists = await db.query('SELECT id FROM catalog.cursos WHERE id = $1', [id])
      if (!exists.rows[0])
        return res
          .status(404)
          .json({ error: { code: 'CURSO_NO_ENCONTRADO', message: 'Curso no encontrado' } })
      const counts = await db.query(
        `SELECT COUNT(DISTINCT t.id)::int AS tomos, COUNT(l.id)::int AS lecciones
      FROM catalog.tomos t LEFT JOIN catalog.lecciones l ON l.tomo_id = t.id WHERE t.curso_id = $1`,
        [id],
      )
      const rowCounts = counts.rows[0]
      if (!rowCounts || rowCounts.tomos === 0 || rowCounts.lecciones === 0)
        return res
          .status(409)
          .json({ error: { code: 'CURSO_NO_PUBLICABLE', message: 'El curso necesita contenido' } })
      const anterior = await db.query('SELECT estado FROM catalog.cursos WHERE id = $1', [id])
      const updated = await db.query(
        `UPDATE catalog.cursos SET estado = 'PUBLICADO', publicado_at = COALESCE(publicado_at, now()), updated_at = now()
      WHERE id = $1 RETURNING estado, publicado_at`,
        [id],
      )
      const row = updated.rows[0]
      if (anterior.rows[0]?.estado !== 'PUBLICADO') {
        const datos = await estructuraCurso(db, id)
        if (datos)
          await publisher.publish([
            new CursoPublicadoEvent(id, datos),
            ...(await contenidoEventos(db, s3, cfg.bucketMedia, id)),
          ])
      }
      return responder(res, {
        estado: row.estado,
        publicadoAt: new Date(row.publicado_at).toISOString(),
      })
    } catch (e) {
      next(e)
    }
  })
  http.post('/api/catalog/admin/cursos/:id/despublicar', ...admin, async (req, res, next) => {
    try {
      const id = req.params.id ?? ''
      const anterior = await db.query('SELECT estado FROM catalog.cursos WHERE id = $1', [id])
      if (!anterior.rows[0])
        return res
          .status(404)
          .json({ error: { code: 'CURSO_NO_ENCONTRADO', message: 'Curso no encontrado' } })
      await db.query(
        `UPDATE catalog.cursos SET estado = 'DESPUBLICADO', updated_at = now() WHERE id = $1`,
        [id],
      )
      if (anterior.rows[0].estado === 'PUBLICADO')
        await publisher.publish([new CursoDespublicadoEvent(id, String(body(req).motivo ?? ''))])
      return responder(res, { estado: 'DESPUBLICADO' })
    } catch (e) {
      next(e)
    }
  })
  http.put('/api/catalog/admin/cursos/:id', ...admin, async (req, res, next) => {
    try {
      const b = body(req)
      const previo = await db.query(
        'SELECT precio, moneda, estado, version_precio FROM catalog.cursos WHERE id = $1',
        [req.params.id],
      )
      if (!previo.rows[0])
        return res
          .status(404)
          .json({ error: { code: 'CURSO_NO_ENCONTRADO', message: 'Curso no encontrado' } })
      const values: unknown[] = []
      const sets: string[] = []
      for (const [key, column] of [
        ['titulo', 'titulo'],
        ['descripcion', 'descripcion'],
        ['tecnologia', 'tecnologia'],
        ['imagenUrl', 'imagen_url'],
        ['precio', 'precio'],
        ['moneda', 'moneda'],
      ] as const) {
        if (b[key] !== undefined) {
          values.push(b[key])
          sets.push(`${column} = $${values.length}`)
        }
      }
      const nuevoPrecio = b.precio === undefined ? Number(previo.rows[0].precio) : Number(b.precio)
      const precioCambio = b.precio !== undefined && nuevoPrecio !== Number(previo.rows[0].precio)
      if (precioCambio && previo.rows[0].estado === 'PUBLICADO')
        sets.push('version_precio = version_precio + 1')
      if (sets.length) {
        values.push(req.params.id ?? '')
        await db.query(
          `UPDATE catalog.cursos SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
          values,
        )
      }
      if (precioCambio && previo.rows[0].estado === 'PUBLICADO')
        await publisher.publish([
          new PrecioActualizadoEvent(req.params.id ?? '', {
            montoAnterior: Number(previo.rows[0].precio),
            montoNuevo: nuevoPrecio,
            moneda: String(b.moneda ?? previo.rows[0].moneda),
            versionPrecio: Number(previo.rows[0].version_precio) + 1,
          }),
        ])
      const data = (await detalleCurso(db, req.params.id ?? '', true)) as {
        versionPrecio: number
      } | null
      return responder(res, { versionPrecio: data?.versionPrecio ?? 1 })
    } catch (e) {
      next(e)
    }
  })

  http.post('/api/catalog/admin/cursos', ...admin, async (req, res, next) => {
    try {
      const b = body(req)
      const slug = String(b.slug ?? '').trim()
      const titulo = String(b.titulo ?? '').trim()
      const descripcion = String(b.descripcion ?? '').trim()
      const tecnologia = String(b.tecnologia ?? '').trim()
      if (!slug || !titulo || !descripcion || !tecnologia) {
        return res.status(400).json({
          error: {
            code: 'CURSO_INVALIDO',
            message: 'Slug, título, descripción y tecnología son obligatorios',
          },
        })
      }
      const r = await db.query(
        `INSERT INTO catalog.cursos
      (id, slug, titulo, descripcion, tecnologia, nivel_min, nivel_max, precio, moneda, imagen_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, slug`,
        [
          randomUUID(),
          slug,
          titulo,
          descripcion,
          tecnologia,
          String(b.nivelMin ?? 'A'),
          String(b.nivelMax ?? 'A'),
          Number(b.precio ?? 0),
          String(b.moneda ?? 'USD'),
          typeof b.imagenUrl === 'string' ? b.imagenUrl : null,
        ],
      )
      return responder(res, { cursoId: r.rows[0].id, slug: r.rows[0].slug }, 201)
    } catch (e) {
      next(e)
    }
  })

  http.get('/api/catalog/admin/lecciones/:id', ...admin, async (req, res, next) => {
    try {
      const data = await contenidoAdmin(db, req.params.id ?? '')
      data
        ? responder(res, data)
        : res
            .status(404)
            .json({ error: { code: 'LECCION_NO_ENCONTRADA', message: 'Lección no encontrada' } })
    } catch (e) {
      next(e)
    }
  })

  http.put('/api/catalog/admin/cursos/:id/contenido', ...admin, async (req, res, next) => {
    try {
      const b = body(req)
      const cursoActual = await db.query('SELECT estado FROM catalog.cursos WHERE id = $1', [
        req.params.id,
      ])
      if (!cursoActual.rows[0])
        return res
          .status(404)
          .json({ error: { code: 'CURSO_NO_ENCONTRADO', message: 'Curso no encontrado' } })
      const tomos = Array.isArray(b.tomos) ? (b.tomos as Record<string, unknown>[]) : []
      const tomosIds: string[] = []
      const leccionesIds: string[] = []
      const tomosResultado: { id: string; lecciones: string[] }[] = []
      for (const tomo of tomos) {
        const tomoId = typeof tomo.id === 'string' ? tomo.id : randomUUID()
        tomosIds.push(tomoId)
        await db.query(
          `INSERT INTO catalog.tomos (id, curso_id, orden, titulo, descripcion, umbral_aprobacion)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET orden = EXCLUDED.orden, titulo = EXCLUDED.titulo,
        descripcion = EXCLUDED.descripcion, umbral_aprobacion = EXCLUDED.umbral_aprobacion, updated_at = now()`,
          [
            tomoId,
            req.params.id,
            Number(tomo.orden ?? 1),
            String(tomo.titulo ?? 'Tomo'),
            typeof tomo.descripcion === 'string' ? tomo.descripcion : null,
            Number(tomo.umbral ?? 70),
          ],
        )
        const materiales = Array.isArray(tomo.materiales)
          ? (tomo.materiales as Record<string, unknown>[])
          : []
        const materialesIds: string[] = []
        for (const material of materiales.slice(0, 4)) {
          const materialId = typeof material.id === 'string' ? material.id : randomUUID()
          materialesIds.push(materialId)
          const tipo = ['PDF', 'ENLACE', 'VIDEO', 'DOCUMENTO'].includes(String(material.tipo))
            ? String(material.tipo)
            : 'DOCUMENTO'
          await db.query(
            `INSERT INTO catalog.materiales (id, tomo_id, orden, titulo, descripcion, tipo, url)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET tomo_id = EXCLUDED.tomo_id, orden = EXCLUDED.orden,
          titulo = EXCLUDED.titulo, descripcion = EXCLUDED.descripcion, tipo = EXCLUDED.tipo,
          url = EXCLUDED.url, updated_at = now()`,
            [
              materialId,
              tomoId,
              Number(material.orden ?? materialesIds.length),
              String(material.titulo ?? 'Material'),
              typeof material.descripcion === 'string' ? material.descripcion : null,
              tipo,
              String(material.url ?? ''),
            ],
          )
        }
        if (materialesIds.length)
          await db.query(
            `DELETE FROM catalog.materiales WHERE tomo_id = $1 AND id <> ALL($2::uuid[])`,
            [tomoId, materialesIds],
          )
        else await db.query(`DELETE FROM catalog.materiales WHERE tomo_id = $1`, [tomoId])
        const lecciones = Array.isArray(tomo.lecciones)
          ? (tomo.lecciones as Record<string, unknown>[])
          : []
        const leccionesDelTomo: string[] = []
        for (const leccion of lecciones) {
          const leccionId = typeof leccion.id === 'string' ? leccion.id : randomUUID()
          leccionesIds.push(leccionId)
          leccionesDelTomo.push(leccionId)
          const bloques = Array.isArray(leccion.bloques) ? leccion.bloques : []
          const hash = createHash('sha256').update(JSON.stringify(bloques)).digest('hex')
          await db.query(
            `INSERT INTO catalog.lecciones (id, tomo_id, orden, titulo, duracion_min, contenido_hash)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET tomo_id = EXCLUDED.tomo_id, orden = EXCLUDED.orden,
          titulo = EXCLUDED.titulo, duracion_min = EXCLUDED.duracion_min, contenido_hash = EXCLUDED.contenido_hash, updated_at = now()`,
            [
              leccionId,
              tomoId,
              Number(leccion.orden ?? 1),
              String(leccion.titulo ?? 'Lección'),
              Number(leccion.duracionMin ?? 10),
              hash,
            ],
          )
          await db.query('DELETE FROM catalog.bloques WHERE leccion_id = $1', [leccionId])
          for (const [orden, bloque] of bloques.entries()) {
            const valor = (bloque ?? {}) as Record<string, unknown>
            await db.query(
              `INSERT INTO catalog.bloques (id, leccion_id, orden, tipo, contenido) VALUES ($1, $2, $3, $4, $5)`,
              [
                randomUUID(),
                leccionId,
                Number(valor.orden ?? orden + 1),
                String(valor.tipo ?? 'TEXTO'),
                JSON.stringify(valor.contenido ?? {}),
              ],
            )
          }
          const ejercicios = Array.isArray(leccion.ejercicios) ? leccion.ejercicios : []
          await db.query('DELETE FROM catalog.ejercicios WHERE leccion_id = $1', [leccionId])
          for (const ejercicio of ejercicios) {
            const valor = (ejercicio ?? {}) as Record<string, unknown>
            await db.query(
              `INSERT INTO catalog.ejercicios (id, leccion_id, enunciado, solucion_esperada, pistas) VALUES ($1, $2, $3, $4, $5)`,
              [
                typeof valor.id === 'string' ? valor.id : randomUUID(),
                leccionId,
                String(valor.enunciado ?? ''),
                JSON.stringify(valor.solucionEsperada ?? {}),
                JSON.stringify(Array.isArray(valor.pistas) ? valor.pistas : []),
              ],
            )
          }
        }
        tomosResultado.push({ id: tomoId, lecciones: leccionesDelTomo })
      }
      if (tomosIds.length)
        await db.query(`DELETE FROM catalog.tomos WHERE curso_id = $1 AND id <> ALL($2::uuid[])`, [
          req.params.id,
          tomosIds,
        ])
      else await db.query('DELETE FROM catalog.tomos WHERE curso_id = $1', [req.params.id])
      if (leccionesIds.length)
        await db.query(
          `DELETE FROM catalog.lecciones WHERE tomo_id IN (SELECT id FROM catalog.tomos WHERE curso_id = $1) AND id <> ALL($2::uuid[])`,
          [req.params.id, leccionesIds],
        )
      if (cursoActual.rows[0].estado === 'PUBLICADO')
        await publisher.publish(
          await contenidoEventos(db, s3, cfg.bucketMedia, req.params.id ?? ''),
        )
      return responder(res, { tomos: tomosResultado, lecciones: leccionesIds.length })
    } catch (e) {
      next(e)
    }
  })

  http.get('/api/catalog/admin/carreras', ...admin, async (_req, res, next) => {
    try {
      responder(res, await listarCarreras(db, true))
    } catch (e) {
      next(e)
    }
  })
  http.post('/api/catalog/admin/carreras', ...admin, async (req, res, next) => {
    try {
      const b = body(req)
      const carreraId = randomUUID()
      await db.query(
        `INSERT INTO catalog.carreras (id, slug, titulo, descripcion, imagen_url, estado)
      VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          carreraId,
          String(b.slug ?? ''),
          String(b.titulo ?? ''),
          String(b.descripcion ?? ''),
          typeof b.imagenUrl === 'string' ? b.imagenUrl : null,
          b.publicar ? 'PUBLICADO' : 'BORRADOR',
        ],
      )
      return responder(res, { carreraId }, 201)
    } catch (e) {
      next(e)
    }
  })
  http.put('/api/catalog/admin/carreras/:id', ...admin, async (req, res, next) => {
    try {
      const b = body(req)
      const values: unknown[] = []
      const sets: string[] = []
      for (const [key, column] of [
        ['slug', 'slug'],
        ['titulo', 'titulo'],
        ['descripcion', 'descripcion'],
        ['imagenUrl', 'imagen_url'],
      ] as const) {
        if (b[key] !== undefined) {
          values.push(b[key])
          sets.push(`${column} = $${values.length}`)
        }
      }
      if (b.publicar !== undefined) {
        values.push(b.publicar ? 'PUBLICADO' : 'BORRADOR')
        sets.push(`estado = $${values.length}`)
      }
      if (sets.length) {
        values.push(req.params.id ?? '')
        await db.query(
          `UPDATE catalog.carreras SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
          values,
        )
      }
      if (Array.isArray(b.cursos)) {
        await db.query('DELETE FROM catalog.carrera_cursos WHERE carrera_id = $1', [req.params.id])
        for (const [orden, curso] of (b.cursos as Record<string, unknown>[]).entries()) {
          await db.query(
            'INSERT INTO catalog.carrera_cursos (carrera_id, curso_id, orden) VALUES ($1, $2, $3)',
            [req.params.id, String(curso.cursoId ?? ''), Number(curso.orden ?? orden + 1)],
          )
        }
      }
      return responder(res, { actualizado: true })
    } catch (e) {
      next(e)
    }
  })

  http.get('/api/catalog/admin/bancos', ...admin, async (_req, res, next) => {
    try {
      responder(res, await bancosAdmin(db))
    } catch (e) {
      next(e)
    }
  })
  http.post('/api/catalog/admin/bancos', ...admin, async (req, res, next) => {
    try {
      const b = body(req)
      const bancoId = randomUUID()
      const uso = String(b.uso ?? 'DIAGNOSTICO_PREVIO') as UsoBancoAdmin
      const tomoId = typeof b.tomoId === 'string' && b.tomoId.length > 0 ? b.tomoId : null
      const cursoId = typeof b.cursoId === 'string' && b.cursoId.length > 0 ? b.cursoId : null
      const errorBanco = validarBancoAdmin(uso, tomoId, cursoId)
      if (errorBanco)
        return res.status(400).json({ error: { code: 'BANCO_INVALIDO', message: errorBanco } })
      await db.query(
        `INSERT INTO catalog.bancos_pregunta (id, uso, tomo_id, curso_id, titulo) VALUES ($1, $2, $3, $4, $5)`,
        [bancoId, uso, tomoId, cursoId, String(b.titulo ?? '')],
      )
      const preguntas = Array.isArray(b.preguntas) ? (b.preguntas as Record<string, unknown>[]) : []
      for (const pregunta of preguntas)
        await db.query(
          `INSERT INTO catalog.preguntas (id, banco_id, tipo, nivel, enunciado, opciones, respuesta_correcta, puntaje) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomUUID(),
            bancoId,
            String(pregunta.tipo ?? 'OPCION_UNICA'),
            pregunta.nivel || null,
            String(pregunta.enunciado ?? ''),
            JSON.stringify(pregunta.opciones ?? []),
            JSON.stringify(pregunta.respuestaCorrecta ?? null),
            Number(pregunta.puntaje ?? 1),
          ],
        )
      return responder(res, { bancoId, cantidadPreguntas: preguntas.length }, 201)
    } catch (e) {
      next(e)
    }
  })
  http.put('/api/catalog/admin/bancos/:id', ...admin, async (req, res, next) => {
    try {
      const b = body(req)
      const actual = await db.query(
        `SELECT uso, tomo_id, curso_id FROM catalog.bancos_pregunta WHERE id = $1 LIMIT 1`,
        [req.params.id],
      )
      if (!actual.rows[0])
        return res
          .status(404)
          .json({ error: { code: 'BANCO_NO_ENCONTRADO', message: 'Banco no encontrado' } })
      const uso = String(b.uso ?? actual.rows[0].uso) as UsoBancoAdmin
      const tomoId =
        b.tomoId === undefined
          ? (actual.rows[0].tomo_id as string | null)
          : typeof b.tomoId === 'string' && b.tomoId.length > 0
            ? b.tomoId
            : null
      const cursoId =
        b.cursoId === undefined
          ? (actual.rows[0].curso_id as string | null)
          : typeof b.cursoId === 'string' && b.cursoId.length > 0
            ? b.cursoId
            : null
      const errorBanco = validarBancoAdmin(uso, tomoId, cursoId)
      if (errorBanco)
        return res.status(400).json({ error: { code: 'BANCO_INVALIDO', message: errorBanco } })
      await db.query(
        `UPDATE catalog.bancos_pregunta SET uso = $1, tomo_id = $2, curso_id = $3, titulo = COALESCE($4, titulo) WHERE id = $5`,
        [uso, tomoId, cursoId, b.titulo ?? null, req.params.id],
      )
      if (Array.isArray(b.preguntas)) {
        await db.query('DELETE FROM catalog.preguntas WHERE banco_id = $1', [req.params.id])
        for (const pregunta of b.preguntas as Record<string, unknown>[])
          await db.query(
            `INSERT INTO catalog.preguntas (id, banco_id, tipo, nivel, enunciado, opciones, respuesta_correcta, puntaje) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              randomUUID(),
              req.params.id,
              String(pregunta.tipo ?? 'OPCION_UNICA'),
              pregunta.nivel || null,
              String(pregunta.enunciado ?? ''),
              JSON.stringify(pregunta.opciones ?? []),
              JSON.stringify(pregunta.respuestaCorrecta ?? null),
              Number(pregunta.puntaje ?? 1),
            ],
          )
      }
      return responder(res, { actualizado: true })
    } catch (e) {
      next(e)
    }
  })

  http.use(noEncontradoMiddleware)
  http.use(errorMiddleware)
  return { http, db, cerrar: () => pool.end() }
}
