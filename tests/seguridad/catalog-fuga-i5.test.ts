// I-5 (doc 03 §5): respuesta_correcta y solucion_esperada no pueden aparecer en
// NINGUNA respuesta HTTP pública. Este test levanta el servicio real contra el
// Postgres y el jwt-local del compose, crea contenido como admin y hace grep
// del body como estudiante. Se salta solo si el entorno local no está arriba.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const DATABASE_URL = 'postgres://svc_catalog:local@localhost:5432/edtech'
const JWT_LOCAL = 'http://localhost:4599'

const entornoArriba = await fetch(`${JWT_LOCAL}/health`, { signal: AbortSignal.timeout(1500) })
  .then(r => r.ok)
  .catch(() => false)

const token = async (groups: string[]): Promise<string> => {
  const r = await fetch(`${JWT_LOCAL}/token`, {
    method: 'POST',
    body: JSON.stringify({ groups }),
  })
  const body = (await r.json()) as { access_token: string }
  return body.access_token
}

describe.skipIf(!entornoArriba)('I-5: fuga de respuestas correctas', () => {
  let base = ''
  let cerrar: (() => Promise<void>) | null = null
  let detener: (() => void) | null = null
  let tomoId = ''
  let leccionId = ''
  let adminToken = ''
  let estudianteToken = ''

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL
    // El issuer del token es el nombre interno del compose; el JWKS se lee por localhost
    process.env.COGNITO_ISSUER = 'http://jwt-local:4599'
    process.env.COGNITO_JWKS_URI = `${JWT_LOCAL}/.well-known/jwks.json`
    process.env.AWS_ENDPOINT_URL = 'http://localhost:4566'
    process.env.AWS_ACCESS_KEY_ID = 'test'
    process.env.AWS_SECRET_ACCESS_KEY = 'test'
    process.env.INTERNO_TOKEN = 'token-de-prueba'

    const { cargarConfig } = await import('../../services/catalog/src/infrastructure/config/config')
    const { construirApp } = await import('../../services/catalog/src/infrastructure/catalog.di')
    const app = await construirApp(
      cargarConfig(),
      join(import.meta.dir, '../../services/catalog/migrations'),
    )
    cerrar = app.cerrar
    const servidor = app.http.listen(0)
    detener = () => servidor.close()
    const puerto = (servidor.address() as { port: number }).port
    base = `http://localhost:${puerto}/api/catalog`

    adminToken = await token(['admin'])
    estudianteToken = await token(['estudiante'])

    // Crear curso + contenido + banco con respuestas, como admin
    const auth = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
    const slugUnico = `fuga-i5-${Date.now()}`
    const creado = (await (
      await fetch(`${base}/admin/cursos`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          slug: slugUnico,
          titulo: 'Curso de prueba I-5',
          descripcion: 'x',
          tecnologia: 'HTML',
          nivelMin: 'A',
          nivelMax: 'B',
          precio: 0,
          moneda: 'USD',
        }),
      })
    ).json()) as { data: { cursoId: string } }
    const cursoId = creado.data.cursoId

    const contenido = (await (
      await fetch(`${base}/admin/cursos/${cursoId}/contenido`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({
          tomos: [
            {
              orden: 1,
              titulo: 'Tomo 1',
              umbral: 70,
              lecciones: [
                {
                  orden: 1,
                  titulo: 'Lección 1',
                  duracionMin: 10,
                  bloques: [{ orden: 1, tipo: 'TEXTO', contenido: { markdown: 'hola' } }],
                  ejercicios: [
                    {
                      enunciado: 'Escribe un h1',
                      solucionEsperada: { codigo: '<h1>hola</h1>' },
                      pistas: ['usa h1'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      })
    ).json()) as { data: { tomos: { id: string; lecciones: string[] }[] } }
    tomoId = contenido.data.tomos[0]!.id
    leccionId = contenido.data.tomos[0]!.lecciones[0]!

    const publicado = await fetch(`${base}/admin/cursos/${cursoId}/publicar`, {
      method: 'POST',
      headers: auth,
    })
    expect(publicado.status).toBe(200)

    await fetch(`${base}/admin/bancos`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        uso: 'EVALUACION_TOMO',
        tomoId,
        titulo: 'Evaluación tomo 1',
        preguntas: [
          {
            tipo: 'OPCION_UNICA',
            enunciado: '¿Qué etiqueta abre un título?',
            opciones: [
              { id: 'a', texto: '<h1>' },
              { id: 'b', texto: '<p>' },
            ],
            respuestaCorrecta: 'a',
            puntaje: 1,
          },
        ],
      }),
    })
  })

  afterAll(async () => {
    detener?.()
    await cerrar?.()
  })

  test('GET /tomos/:id/evaluacion no contiene respuesta_correcta en ninguna parte del body', async () => {
    const r = await fetch(`${base}/tomos/${tomoId}/evaluacion`, {
      headers: { Authorization: `Bearer ${estudianteToken}` },
    })
    expect(r.status).toBe(200)
    const body = await r.text()
    expect(body).not.toContain('respuesta_correcta')
    expect(body).not.toContain('respuestaCorrecta')
    // Y sí contiene la pregunta (el endpoint funciona)
    expect(body).toContain('¿Qué etiqueta abre un título?')
  })

  test('GET /lecciones/:id no contiene solucion_esperada', async () => {
    const r = await fetch(`${base}/lecciones/${leccionId}`, {
      headers: { Authorization: `Bearer ${estudianteToken}` },
    })
    expect(r.status).toBe(200)
    const body = await r.text()
    expect(body).not.toContain('solucion')
    expect(body).toContain('pistas')
  })

  test('la API interna exige el token compartido (A-19)', async () => {
    const sinToken = await fetch(`${base}/interno/bancos/${crypto.randomUUID()}/respuestas`)
    expect(sinToken.status).toBe(401)
  })

  test('el catálogo público responde sin autenticación', async () => {
    const r = await fetch(`${base}/cursos`)
    expect(r.status).toBe(200)
  })
})
