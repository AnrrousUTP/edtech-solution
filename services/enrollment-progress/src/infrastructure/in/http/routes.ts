import {
  isOk,
  requiereAuth,
  requiereRol,
  type CommandBus,
  type QueryBus,
  type Result,
} from '@edtech/shared-kernel'
import { Router, json, type Request, type Response } from 'express'
import type { Config } from '../../config/config'

const MAPA: Record<string, number> = {
  SIN_MATRICULA: 403,
  MATRICULA_NO_ACTIVA: 403,
  MATRICULA_DUPLICADA: 409,
  LECCION_FUERA_DEL_CURSO: 400,
  LECCION_BLOQUEADA: 409,
  CURSO_NO_PROYECTADO: 404,
  CURSO_NO_PUBLICADO: 409,
  CURSO_NO_GRATUITO: 402,
  INTENTO_NO_ENCONTRADO: 404,
  INTENTO_YA_ENTREGADO: 409,
  INTENTO_AJENO: 403,
  BANCO_NO_DISPONIBLE: 503,
  TOMO_NO_ENCONTRADO: 404,
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

const cuerpo = (req: Request): Record<string, unknown> =>
  (req.body ?? {}) as Record<string, unknown>

export const crearRouter = (bus: CommandBus, queries: QueryBus, cfg: Config): Router => {
  const router = Router()
  router.use(json())
  const auth = requiereAuth({
    issuer: cfg.cognito.issuer,
    ...(cfg.cognito.clientId ? { clientId: cfg.cognito.clientId } : {}),
    ...(cfg.cognito.jwksUri ? { jwksUri: cfg.cognito.jwksUri } : {}),
  })

  // Matrícula gratuita (la de pago llega SOLO por evento, doc 02 §5.3)
  router.post('/matriculas', auth, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'CrearMatricula',
        usuarioId: req.auth?.usuarioId ?? '',
        cursoId: String(b.cursoId ?? ''),
        origen: 'GRATUITO',
      }),
      201,
    )
  })

  router.post('/admin/matriculas', auth, requiereRol('admin'), async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'CrearMatricula',
        usuarioId: String(b.usuarioId ?? ''),
        cursoId: String(b.cursoId ?? ''),
        origen: 'ALTA_MANUAL',
      }),
      201,
    )
  })

  router.get('/mis-matriculas', auth, async (req, res) => {
    responder(
      res,
      await queries.dispatch({ _tag: 'MisMatriculas', usuarioId: req.auth?.usuarioId ?? '' }),
    )
  })

  router.get('/evaluacion-inicial/estado/:cursoId', auth, async (req, res) => {
    responder(
      res,
      await queries.dispatch({
        _tag: 'EvaluacionInicial',
        usuarioId: req.auth?.usuarioId ?? '',
        cursoId: req.params.cursoId ?? '',
      }),
    )
  })

  router.get('/progreso/:cursoId', auth, async (req, res) => {
    responder(
      res,
      await queries.dispatch({
        _tag: 'ProgresoCurso',
        usuarioId: req.auth?.usuarioId ?? '',
        cursoId: req.params.cursoId ?? '',
      }),
    )
  })

  router.post('/lecciones/:leccionId/completar', auth, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'CompletarLeccion',
        usuarioId: req.auth?.usuarioId ?? '',
        cursoId: String(b.cursoId ?? ''),
        leccionId: req.params.leccionId ?? '',
      }),
    )
  })

  router.post('/intentos', auth, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'IniciarIntento',
        usuarioId: req.auth?.usuarioId ?? '',
        tipo: String(b.tipo ?? 'TOMO'),
        bancoId: String(b.bancoId ?? ''),
        ...(typeof b.cursoId === 'string' ? { cursoId: b.cursoId } : {}),
        ...(typeof b.tomoId === 'string' ? { tomoId: b.tomoId } : {}),
      }),
      201,
    )
  })

  router.post('/intentos/:id/entregar', auth, async (req, res) => {
    const b = cuerpo(req)
    responder(
      res,
      await bus.dispatch({
        _tag: 'EntregarIntento',
        usuarioId: req.auth?.usuarioId ?? '',
        intentoId: req.params.id ?? '',
        respuestas: Array.isArray(b.respuestas)
          ? (b.respuestas as { preguntaId: string; respuesta: unknown }[])
          : [],
      }),
    )
  })

  return router
}
