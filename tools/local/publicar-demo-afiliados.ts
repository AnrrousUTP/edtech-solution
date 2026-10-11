import pg from 'pg'
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { validarContra } from '../../packages/shared-kernel/src/events/validador'
const jwt = process.env.AFFILIATES_E2E_JWT ?? 'http://localhost:4699'
const api = process.env.AFFILIATES_E2E_API ?? 'http://localhost:8180'
const endpoint = process.env.AFFILIATES_E2E_EVENTS ?? 'http://localhost:4567'
const database = process.env.DATABASE_URL ?? 'postgres://svc_catalog:local@localhost:55432/edtech'
for (const url of [jwt, api, endpoint, database])
  if (
    !['jwt-local', 'gateway', 'localstack', 'postgres', 'localhost', '127.0.0.1'].includes(
      new URL(url).hostname,
    )
  )
    throw new Error('Solo se publica la demo local')
const auth = await fetch(`${jwt}/token`, {
  method: 'POST',
  body: JSON.stringify({ groups: ['admin'] }),
})
const { access_token } = (await auth.json()) as { access_token: string }
for (const n of [101, 102, 103, 104]) {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const r = await fetch(`${api}/api/catalog/admin/cursos/${id}/publicar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}` },
  })
  if (!r.ok) throw new Error(`No se pudo publicar el curso ${n}: ${r.status} ${await r.text()}`)
  console.log(`Curso ${n} publicado`)
}

// Al incorporar un consumidor nuevo a una base ya sembrada, publicar otra vez
// es idempotente y no emite eventos. Este bootstrap local repone sus proyecciones
// con los datos actuales del catálogo; nunca lee esquemas de otros servicios.
const pool = new pg.Pool({ connectionString: database, max: 1 })
const events = new EventBridgeClient({
  endpoint,
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})
try {
  for (const n of [101, 102, 103, 104]) {
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
    const course = (
      await pool.query("SELECT * FROM catalog.cursos WHERE id=$1 AND estado='PUBLICADO'", [id])
    ).rows[0]
    if (!course) throw new Error(`Curso demo ${n} no publicado`)
    const tomos = (
      await pool.query('SELECT * FROM catalog.tomos WHERE curso_id=$1 ORDER BY orden', [id])
    ).rows
    const estructura = []
    for (const t of tomos) {
      const lecciones = (
        await pool.query(
          'SELECT id,orden,titulo FROM catalog.lecciones WHERE tomo_id=$1 ORDER BY orden',
          [t.id],
        )
      ).rows
      estructura.push({
        tomoId: t.id,
        orden: t.orden,
        titulo: t.titulo,
        umbral: t.umbral_aprobacion,
        lecciones,
      })
    }
    const payload = {
      cursoId: id,
      slug: course.slug,
      titulo: course.titulo,
      tecnologia: course.tecnologia,
      nivelMin: String(course.nivel_min).trim(),
      nivelMax: String(course.nivel_max).trim(),
      precio: Number(course.precio),
      moneda: String(course.moneda).trim(),
      versionPrecio: course.version_precio,
      estructura,
    }
    if (!validarContra('catalog.curso-publicado.v1', payload).valido)
      throw new Error('Snapshot del catálogo incompatible con el contrato')
    const result = await events.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: 'edtech-domain-events',
            Source: 'catalog',
            DetailType: 'catalog.curso-publicado.v1',
            Detail: JSON.stringify({
              eventId: crypto.randomUUID(),
              eventType: 'catalog.curso-publicado.v1',
              aggregateId: id,
              occurredAt: new Date().toISOString(),
              correlationId: crypto.randomUUID(),
              payload,
            }),
          },
        ],
      }),
    )
    if (result.FailedEntryCount) throw new Error('No se pudo reconstruir una proyección local')
  }
  console.log('Proyecciones de los cuatro cursos de demo sincronizadas por eventos')
} finally {
  await pool.end()
}
