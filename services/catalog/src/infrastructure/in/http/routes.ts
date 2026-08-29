import {
  isOk,
  requiereAuth,
  requiereRol,
  type CommandBus,
  type QueryBus,
  type Result,
} from '@edtech/shared-kernel'
import { Router, json, type Request, type RequestHandler, type Response } from 'express'
import type { Config } from '../../config/config'

const MAPA: Record<string, number> = {
  CURSO_NO_ENCONTRADO: 404,
  TOMO_NO_ENCONTRADO: 404,
  LECCION_NO_ENCONTRADA: 404,
  CARRERA_NO_ENCONTRADA: 404,
  BANCO_NO_ENCONTRADO: 404,
  CURSO_NO_PUBLICABLE: 409,
  ORDEN_NO_CONTIGUO: 400,
  SLUG_INVALIDO: 400,
  SLUG_DUPLICADO: 409,
  NIVEL_INVALIDO: 400,
  DINERO_INVALIDO: 400,
  BANCO_INVALIDO: 400,
  CONTENIDO_INVALIDO: 400,
  ID_INVALIDO: 400,
}
const codigoHttp = (code: string): number => MAPA[code] ?? 500

const responder = <T>(
  res: Response,
  r: Result<T, { code: string; message: string }>,
  okStatus = 200,
): void => {
  if (isOk(r)) {
    res.status(okStatus).json({ data: r.value })
    return
  }
  res.status(codigoHttp(r.error.code)).json({
    error: { code: r.error.code, message: r.error.message },
  })
}

type Despacho = { code: string; message: string }

export const crearRouter = (
  bus: CommandBus,
  queries: QueryBus,
  cfg: Config,
  internoToken: string,
): Router => {
  const router = Router()
  router.use(json({ limit: '2mb' }))
  const auth = requiereAuth({
    issuer: cfg.cognito.issuer,
    ...(cfg.cognito.clientId ? { clientId: cfg.cognito.clientId } : {}),
    ...(cfg.cognito.jwksUri ? { jwksUri: cfg.cognito.jwksUri } : {}),
  })
  const admin = [auth, requiereRol('admin')]

  // ── Pública (el catálogo se ve sin cuenta, doc 08 §5) ─────────────────────
  router.get('/cursos', async (_req, res) => {
    responder(res, await queries.dispatch({ _tag: 'ListarCursos', incluirNoPublicados: false }))
  })

  router.get('/cursos/:slugOId', async (req, res) => {
    responder(
      res,
      await queries.dispatch({
        _tag: 'ObtenerCurso',
        slugOId: req.params.slugOId ?? '',
        incluirNoPublicados: false,
      }),
    )
  })

  router.get('/carreras', async (_req, res) => {
    responder(res, await queries.dispatch({ _tag: 'ListarCarreras', incluirNoPublicadas: false }))
  })

  // Test de nivelación: preguntas SIN respuestas (I-5)
  router.get('/nivelacion', async (_req, res) => {
    responder(res, await queries.dispatch({ _tag: 'ObtenerNivelacion' }))
  })

  // ── Autenticada (contenido del curso; gating de matrícula: A-18) ──────────
  router.get('/lecciones/:id', auth, async (req, res) => {
    responder(
      res,
      await queries.dispatch({ _tag: 'ObtenerLeccion', leccionId: req.params.id ?? '' }),
    )
  })

  // Evaluación del tomo: preguntas SIN respuesta_correcta (I-5)
  router.get('/tomos/:id/evaluacion', auth, async (req, res) => {
    responder(
      res,
      await queries.dispatch({ _tag: 'ObtenerEvaluacion', tomoId: req.params.id ?? '' }),
    )
  })

  // ── Interna (A-19): SOLO enrollment, con token compartido. No es pública. ──
  const interno: RequestHandler = (req, res, next) => {
    if (req.headers['x-interno-token'] !== internoToken) {
      res.status(401).json({ error: { code: 'NO_AUTORIZADO', message: 'Token interno inválido' } })
      return
    }
    next()
  }
  router.get('/interno/bancos/:id/respuestas', interno, async (req, res) => {
    responder(
      res,
      await queries.dispatch({ _tag: 'ObtenerRespuestas', bancoId: req.params.id ?? '' }),
    )
  })

  // ── Admin ─────────────────────────────────────────────────────────────────
  router.get('/admin/cursos', ...admin, async (_req, res) => {
    responder(res, await queries.dispatch({ _tag: 'ListarCursos', incluirNoPublicados: true }))
  })

  router.get('/admin/cursos/:slugOId', ...admin, async (req, res) => {
    responder(
      res,
      await queries.dispatch({
        _tag: 'ObtenerCurso',
        slugOId: req.params.slugOId ?? '',
        incluirNoPublicados: true,
      }),
    )
  })

  router.post('/admin/cursos', ...admin, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'CrearCurso',
        slug: String(b.slug ?? ''),
        titulo: String(b.titulo ?? ''),
        descripcion: String(b.descripcion ?? ''),
        tecnologia: String(b.tecnologia ?? ''),
        nivelMin: String(b.nivelMin ?? 'A'),
        nivelMax: String(b.nivelMax ?? 'A'),
        precio: Number(b.precio ?? 0),
        moneda: String(b.moneda ?? 'USD'),
        ...(typeof b.imagenUrl === 'string' ? { imagenUrl: b.imagenUrl } : {}),
      }),
      201,
    )
  })

  router.put('/admin/cursos/:id', ...admin, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'ActualizarCurso',
        cursoId: req.params.id ?? '',
        ...(typeof b.titulo === 'string' ? { titulo: b.titulo } : {}),
        ...(typeof b.descripcion === 'string' ? { descripcion: b.descripcion } : {}),
        ...(typeof b.tecnologia === 'string' ? { tecnologia: b.tecnologia } : {}),
        ...(b.imagenUrl !== undefined ? { imagenUrl: b.imagenUrl as string | null } : {}),
        ...(b.precio !== undefined ? { precio: Number(b.precio) } : {}),
        ...(typeof b.moneda === 'string' ? { moneda: b.moneda } : {}),
      }),
    )
  })

  router.put('/admin/cursos/:id/contenido', ...admin, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'ActualizarContenido',
        cursoId: req.params.id ?? '',
        tomos: Array.isArray(b.tomos) ? b.tomos : [],
      }),
    )
  })

  router.post('/admin/cursos/:id/publicar', ...admin, async (req, res) => {
    responder(res, await bus.dispatch({ _tag: 'PublicarCurso', cursoId: req.params.id ?? '' }))
  })

  router.post('/admin/cursos/:id/despublicar', ...admin, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'DespublicarCurso',
        cursoId: req.params.id ?? '',
        motivo: String(b.motivo ?? ''),
      }),
    )
  })

  router.post('/admin/carreras', ...admin, async (req, res) => {
    const b = cuerpo(req)
    responder(res, await bus.dispatch({ ...b, _tag: 'GestionarCarrera' }), 201)
  })

  router.put('/admin/carreras/:id', ...admin, async (req, res) => {
    const b = cuerpo(req)
    responder(res, await bus.dispatch({ ...b, _tag: 'GestionarCarrera', carreraId: req.params.id }))
  })

  router.get('/admin/carreras', ...admin, async (_req, res) => {
    responder(res, await queries.dispatch({ _tag: 'ListarCarreras', incluirNoPublicadas: true }))
  })

  router.post('/admin/bancos', ...admin, async (req, res) => {
    const b = cuerpo(req)
    responder(res, await bus.dispatch({ ...b, _tag: 'GestionarBanco' }), 201)
  })

  router.put('/admin/bancos/:id', ...admin, async (req, res) => {
    const b = cuerpo(req)
    responder(res, await bus.dispatch({ ...b, _tag: 'GestionarBanco', bancoId: req.params.id }))
  })

  return router
}

const cuerpo = (req: Request): Record<string, unknown> =>
  (req.body ?? {}) as Record<string, unknown>
