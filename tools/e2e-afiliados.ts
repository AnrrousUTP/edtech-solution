import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { PNG } from 'pngjs'
import jsQR from 'jsqr'
const API = process.env.AFFILIATES_E2E_API ?? 'http://localhost:8180'
const WEB = process.env.AFFILIATES_E2E_WEB ?? 'http://localhost:3100'
const JWT = process.env.AFFILIATES_E2E_JWT ?? 'http://localhost:4699'
const EVENTS = process.env.AFFILIATES_E2E_EVENTS ?? 'http://localhost:4567'
for (const u of [API, WEB, JWT, EVENTS])
  if (
    !['localhost', '127.0.0.1', 'gateway', 'web', 'jwt-local', 'localstack'].includes(
      new URL(u).hostname,
    )
  )
    throw new Error('Este E2E solo puede ejecutarse contra el stack local')
let checks = 0
const assert = (name: string, value: unknown) => {
  if (!value) throw new Error(`FALLA: ${name}`)
  checks++
  console.log(`OK ${name}`)
}
const token = async (sub: string, admin = false) => {
  const r = await fetch(`${JWT}/token`, {
    method: 'POST',
    body: JSON.stringify({
      sub,
      groups: [admin ? 'admin' : 'estudiante'],
      email: 'demo@edtech.test',
    }),
  })
  if (!r.ok) throw new Error('El emisor local no responde')
  return ((await r.json()) as { access_token: string }).access_token
}
const call = async <T = Record<string, unknown>>(
  path: string,
  t?: string,
  method = 'GET',
  body?: unknown,
) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const raw = await r.text(),
    parsed = raw ? JSON.parse(raw) : {}
  return { status: r.status, data: parsed.data as T, error: parsed.error }
}
const wait = async <T>(label: string, f: () => Promise<T>, ok: (v: T) => boolean, seconds = 45) => {
  for (let i = 0; i < seconds; i++) {
    const v = await f()
    if (ok(v)) return v
    await Bun.sleep(1000)
  }
  throw new Error(`Timeout: ${label}`)
}
const afiliadoId = crypto.randomUUID(),
  buyerId = crypto.randomUUID(),
  otherId = crypto.randomUUID()
const [affToken, buyerToken, otherToken, adminToken] = await Promise.all([
  token(afiliadoId),
  token(buyerId),
  token(otherId),
  token(crypto.randomUUID(), true),
])
type A = { id: string; usuarioId: string; refId: string }
type R = {
  totalCentavos: number
  ventas: number
  visitas: number
  historial: { id: string; estado: string; ingresoCentavos: number }[]
}
type T = {
  id: string
  version: number
  versionReportada: number
  conectado: boolean
  previewToken: string
  mensaje: string
  ultimoAviso: string | null
}
const created = await call<A>('/api/affiliates/me', affToken, 'POST', {})
assert('alta de afiliado', created.status === 200)
const aff = created.data
const again = await call<A>('/api/affiliates/me', affToken, 'POST', {})
assert('alta repetida conserva el QR', again.data.refId === aff.refId)
assert('lectura privada exige JWT', (await call('/api/affiliates/ingresos')).status === 401)
const cookie = `edtech_access=${affToken}`
const pngResponse = await fetch(`${WEB}/api/afiliados/qr?formato=png`, {
  headers: { Cookie: cookie },
})
assert(
  'descarga QR real',
  pngResponse.status === 200 && pngResponse.headers.get('content-type') === 'image/png',
)
const png = PNG.sync.read(Buffer.from(await pngResponse.arrayBuffer()))
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
assert('QR decodifica el enlace personal', decoded?.data.endsWith(`/r/${aff.refId}`))
const qrPath = `${WEB}/r/${aff.refId}`
const opened = await fetch(qrPath, { redirect: 'manual' })
assert(
  'abrir QR redirige al catálogo',
  opened.status === 307 && opened.headers.get('location')?.includes('/cursos'),
)
const visitCookie = opened.headers
  .getSetCookie()
  .find(c => c.startsWith('edtech_referral_visit='))
  ?.split(';')[0]
assert(
  'referencia conservada en cookie propia',
  visitCookie && opened.headers.getSetCookie().some(c => /httponly/i.test(c)),
)
const visitId = visitCookie!.split('=')[1]!
const proof = await call<{ prueba: string | null }>(
  '/api/affiliates/atribucion',
  buyerToken,
  'POST',
  { visitaId: visitId },
)
assert('atribución firmada para el comprador', proof.status === 200 && proof.data.prueba)
const proofOther = await call<{ prueba: string | null }>(
  '/api/affiliates/atribucion',
  otherToken,
  'POST',
  { visitaId: visitId },
)
assert('la visita vinculada no se transfiere a otra cuenta', proofOther.data.prueba === null)
const fresh = await call<{ visitaId: string }>(
  `/api/affiliates/referidos/${aff.refId}/visitas`,
  undefined,
  'POST',
  {},
)
assert(
  'autorreferido no emite prueba',
  (
    await call<{ prueba: string | null }>('/api/affiliates/atribucion', affToken, 'POST', {
      visitaId: fresh.data.visitaId,
    })
  ).data.prueba === null,
)
const cursoId = '00000000-0000-4000-8000-000000000104'
type O = { ordenId: string; monto: number; reutilizada: boolean }
const urls = {
  urlRetorno: 'http://localhost:3100/checkout/python-aplicado-demo',
  urlCancelacion: 'http://localhost:3100/cursos',
}
await wait(
  'proyección del precio',
  () =>
    call<O>('/api/payments/ordenes', buyerToken, 'POST', {
      cursoId,
      ...urls,
      pruebaAtribucion: proof.data.prueba,
    }),
  r => r.status === 201,
)
const order = await call<O>('/api/payments/ordenes', buyerToken, 'POST', {
  cursoId,
  ...urls,
  pruebaAtribucion: proof.data.prueba,
})
assert('orden de USD 40 con referencia', order.status === 201 && order.data.monto === 40)
assert('doble clic reutiliza la orden', order.data.reutilizada === true)
assert(
  'otra cuenta no puede capturar la orden',
  (await call(`/api/payments/ordenes/${order.data.ordenId}/capturar`, otherToken, 'POST', {}))
    .status === 403,
)
assert(
  'ingresos aún cero antes de capturar',
  (await call<R>('/api/affiliates/ingresos', affToken)).data.totalCentavos === 0,
)
const capture = await call<{ capturaId: string }>(
  `/api/payments/ordenes/${order.data.ordenId}/capturar`,
  buyerToken,
  'POST',
  {},
)
assert('compra simulada confirmada', capture.status === 200)
const income = await wait(
  'comisión',
  () => call<R>('/api/affiliates/ingresos', affToken),
  r => r.data?.totalCentavos === 200,
)
assert('5% registra USD 2', income.data.totalCentavos === 200 && income.data.ventas === 1)
assert('historial registrado', income.data.historial[0]?.estado === 'REGISTRADA')
const notices = await wait(
  'notificación',
  () =>
    call<{ id: string; mensaje: string; leida: boolean }[]>(
      '/api/affiliates/notificaciones',
      affToken,
    ),
  r => r.data?.length === 1,
)
assert('notificación de nueva comisión', notices.data[0]?.mensaje.includes('2.00'))
assert(
  'otra cuenta no puede marcar una notificación ajena',
  (
    await call(
      `/api/affiliates/notificaciones/${notices.data[0]!.id}/leida`,
      otherToken,
      'POST',
      {},
    )
  ).status === 404,
)
assert(
  'propietario puede marcarla leída',
  (await call(`/api/affiliates/notificaciones/${notices.data[0]!.id}/leida`, affToken, 'POST', {}))
    .status === 200,
)
assert(
  'API admin bloquea estudiantes',
  (await call('/api/affiliates/admin', affToken)).status === 403,
)
assert(
  'admin consulta las comisiones',
  (await call('/api/affiliates/admin', adminToken)).status === 200,
)
assert(
  'identificadores enviados por cliente no crean afiliación para otro usuario',
  (await call<A>('/api/affiliates/me', otherToken, 'POST', { usuarioId: afiliadoId })).data
    .usuarioId === otherId,
)
const claims = JSON.parse(Buffer.from(proof.data.prueba!.split('.')[1]!, 'base64url').toString())
const payload = {
  afiliadoId: claims.afiliadoId,
  afiliadoUsuarioId: claims.afiliadoUsuarioId,
  visitaId: claims.visitaId,
  refId: claims.refId,
  compradorId: buyerId,
  politica: claims.politica,
  tasaBps: claims.tasaBps,
  ordenId: order.data.ordenId,
  cursoId,
  cursoTitulo: 'Python Aplicado',
  baseCentavos: 4000,
  moneda: 'USD',
  capturaId: capture.data.capturaId,
  confirmadoAt: new Date().toISOString(),
}
const events = new EventBridgeClient({
  region: 'us-east-1',
  endpoint: EVENTS,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})
const emit = async (eventType: string, p: Record<string, unknown>, id = crypto.randomUUID()) => {
  const r = await events.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: 'edtech-domain-events',
          Source: `edtech.${eventType.split('.')[0]}`,
          DetailType: eventType,
          Detail: JSON.stringify({
            eventId: id,
            eventType,
            occurredAt: new Date().toISOString(),
            aggregateId: String(p.ordenId ?? ''),
            correlationId: crypto.randomUUID(),
            payload: p,
          }),
        },
      ],
    }),
  )
  if (r.FailedEntryCount) throw new Error('EventBridge local rechazó el evento')
}
const duplicateId = crypto.randomUUID()
await emit('payments.venta-referida-confirmada.v1', payload, duplicateId)
await emit('payments.venta-referida-confirmada.v1', payload, duplicateId)
await emit('payments.venta-referida-confirmada.v1', payload)
await Bun.sleep(4000)
assert(
  'eventos repetidos no duplican ingresos ni ventas',
  (await call<R>('/api/affiliates/ingresos', affToken)).data.totalCentavos === 200,
)
assert(
  'eventos repetidos no duplican notificación',
  (await call<unknown[]>('/api/affiliates/notificaciones', affToken)).data.length === 1,
)
await wait(
  'proyección de afiliado IoT',
  () => call('/api/iot/solicitud', affToken, 'POST', {}),
  r => r.status === 200,
)
assert(
  'solicitud de terminal registrada',
  (await call('/api/iot/solicitud', affToken, 'POST', {})).status === 200,
)
assert(
  'solo admin asigna terminal',
  (await call('/api/iot/admin/asignacion', affToken, 'PUT', { usuarioId: afiliadoId })).status ===
    403,
)
assert(
  'admin asigna terminal de demo',
  (await call('/api/iot/admin/asignacion', adminToken, 'PUT', { usuarioId: afiliadoId })).status ===
    200,
)
const terminal = await wait(
  'configuración MQTT',
  () => call<{ terminal: T }>('/api/iot/me', affToken),
  r => r.data?.terminal?.conectado && r.data.terminal.version === r.data.terminal.versionReportada,
)
assert('terminal conecta y confirma versión', terminal.data.terminal.conectado)
const t = terminal.data.terminal
assert(
  'vista pública requiere token',
  (await call(`/api/iot/vista/${t.id}?token=incorrecto`)).status === 404,
)
assert(
  'vista pública no expone usuario',
  (await call(`/api/iot/vista/${t.id}?token=${t.previewToken}`)).data.usuarioId === undefined,
)
assert(
  'otro usuario no puede configurar terminal',
  (
    await call('/api/iot/me', otherToken, 'PUT', {
      mensaje: 'No autorizado',
      habilitado: true,
      version: t.version,
    })
  ).status === 409,
)
assert(
  'cambio de promoción solicitado',
  (
    await call('/api/iot/me', affToken, 'PUT', {
      mensaje: 'Aprende Python con mi recomendación',
      habilitado: true,
      version: t.version,
    })
  ).status === 200,
)
assert(
  'configuración vieja no sobreescribe la nueva',
  (
    await call('/api/iot/me', affToken, 'PUT', {
      mensaje: 'Versión vieja',
      habilitado: true,
      version: t.version,
    })
  ).status === 409,
)
await wait(
  'configuración aplicada',
  () => call<{ terminal: T }>('/api/iot/me', affToken),
  r =>
    r.data.terminal.version === r.data.terminal.versionReportada &&
    r.data.terminal.mensaje === 'Aprende Python con mi recomendación',
)
await emit('affiliates.comision-registrada.v1', {
  afiliadoId: aff.id,
  usuarioId: afiliadoId,
  refId: aff.refId,
  ordenId: crypto.randomUUID(),
  comisionCentavos: 200,
})
await wait(
  'aviso confirmado por el dispositivo',
  () => call<{ terminal: T }>('/api/iot/me', affToken),
  r => r.data.terminal.ultimoAviso === 'Nueva venta confirmada',
)
assert('terminal recibe y confirma aviso MQTT', true)
const oldPreview = t.previewToken
await call('/api/iot/admin/asignacion', adminToken, 'PUT', { usuarioId: afiliadoId })
assert(
  'reasignación revoca la vista previa',
  (await call(`/api/iot/vista/${t.id}?token=${oldPreview}`)).status === 404,
)
const refund = async (monto: string, id: string) => {
  const r = await fetch(`${API}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'paypal-transmission-sig': 'local' },
    body: JSON.stringify({
      id,
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: {
        id: `refund-${id}`,
        custom_id: order.data.ordenId,
        amount: { value: monto, currency_code: 'USD' },
        links: [
          {
            rel: 'up',
            href: `https://api.sandbox.paypal.com/v2/payments/captures/${capture.data.capturaId}`,
          },
        ],
      },
    }),
  })
  if (!r.ok) throw new Error('No se pudo simular el reembolso')
}
const refund1 = crypto.randomUUID()
await refund('10.00', refund1)
await wait(
  'ajuste parcial',
  () => call<R>('/api/affiliates/ingresos', affToken),
  r => r.data.totalCentavos === 150,
)
assert(
  'reembolso parcial deja USD 1.50',
  (await call<R>('/api/affiliates/ingresos', affToken)).data.historial[0]?.estado === 'AJUSTADA',
)
await refund('10.00', refund1)
await Bun.sleep(2000)
assert(
  'reembolso repetido no duplica ajuste',
  (await call<R>('/api/affiliates/ingresos', affToken)).data.totalCentavos === 150,
)
await refund('30.00', crypto.randomUUID())
await wait(
  'ajuste total',
  () => call<R>('/api/affiliates/ingresos', affToken),
  r => r.data.totalCentavos === 0,
)
assert(
  'historial conserva la venta anulada',
  (await call<R>('/api/affiliates/ingresos', affToken)).data.historial[0]?.estado === 'ANULADA',
)
assert(
  'QR permanece igual tras ventas y cambios',
  (await call<A>('/api/affiliates/me', affToken)).data.refId === aff.refId,
)
assert(
  'suspensión de afiliado',
  (await call(`/api/affiliates/admin/${aff.id}`, adminToken, 'PUT', { activo: false })).status ===
    200,
)
assert(
  'enlace pausado no atribuye nuevas visitas',
  (await call(`/api/affiliates/referidos/${aff.refId}/visitas`, undefined, 'POST', {})).status ===
    404,
)
for (const path of [
  '/afiliados/panel',
  '/afiliados/qr',
  '/afiliados/ingresos',
  '/afiliados/notificaciones',
  '/afiliados/terminal',
]) {
  const r = await fetch(`${WEB}${path}`, { headers: { Cookie: cookie } }),
    html = await r.text()
  assert(`vista ${path}`, r.ok && !html.includes('No pudimos cargar esta sección'))
}
console.log(`E2E AFILIADOS OK: ${checks} verificaciones. Compras y claves exclusivamente locales.`)
