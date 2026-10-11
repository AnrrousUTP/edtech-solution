// Prepara una demostración real del flujo local, sin llamadas a AWS ni PayPal.
const WEB = process.env.AFFILIATES_E2E_WEB ?? 'http://localhost:3100'
const JWT = process.env.AFFILIATES_E2E_JWT ?? 'http://localhost:4699'
for (const url of [WEB, JWT])
  if (!['web', 'jwt-local', 'localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Solo demo local')
const ANA = '00000000-0000-4000-8000-000000000002'
const BUYER = '00000000-0000-4000-8000-000000000004'
const COURSE = '00000000-0000-4000-8000-000000000104'
async function request(path: string, cookie: string, method = 'GET', body?: unknown) {
  const r = await fetch(`${WEB}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      Origin: process.env.AFFILIATES_E2E_ORIGIN ?? 'http://localhost:3100',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await r.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Respuesta no JSON en ${path}: ${r.status}`)
  }
  return { status: r.status, data }
}
async function waitFor(label: string, check: () => Promise<boolean>) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return
    await Bun.sleep(1000)
  }
  throw new Error(`No se completó: ${label}`)
}
const login = await fetch(`${WEB}/api/auth/local`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accion: 'login',
    email: 'ana@edtech.test',
    password: 'AnaDemo123',
    destino: '/afiliados',
  }),
})
if (!login.ok) throw new Error(`Inicio de sesión local falló: ${login.status}`)
const anaCookie = login.headers
  .getSetCookie()
  .map(c => c.split(';')[0])
  .join('; ')
const activation = await request('/api/afiliados/activar', anaCookie, 'POST', {})
if (activation.status !== 200)
  throw new Error(
    `No se pudo activar la demo de Ana: ${activation.status} ${JSON.stringify(activation.data)}`,
  )
const aff = activation.data.data
const destination = await request('/api/afiliados/configuracion', anaCookie, 'PUT', {
  cursoSlug: 'python-aplicado-demo',
})
if (destination.status !== 200)
  throw new Error('Publica los cursos con seed antes de preparar la demo')
const admin = await fetch(`${JWT}/token`, {
  method: 'POST',
  body: JSON.stringify({ groups: ['admin'] }),
})
const adminCookie = `edtech_access=${((await admin.json()) as { access_token: string }).access_token}`
const currentTerminal = await request('/api/afiliados/terminal', anaCookie)
if (!currentTerminal.data.data?.terminal) {
  await waitFor('proyección del afiliado', async () => {
    const r = await request('/api/afiliados/admin/terminales/asignacion', adminCookie, 'PUT', {
      usuarioId: ANA,
    })
    return r.status === 200
  })
}
await waitFor('terminal conectado', async () => {
  const r = await request('/api/afiliados/terminal', anaCookie)
  const t = r.data.data?.terminal
  return t?.conectado && t.version === t.versionReportada
})
const open = await fetch(`${WEB}/r/${aff.refId}`, { redirect: 'manual' })
if (open.status !== 307 || !open.headers.get('location')?.includes('/cursos/python-aplicado-demo'))
  throw new Error('El QR no lleva al curso configurado')
const visit = open.headers
  .getSetCookie()
  .find(c => c.startsWith('edtech_referral_visit='))
  ?.split(';')[0]
if (!visit) throw new Error('La referencia no se conservó')
const buyerToken = await fetch(`${JWT}/token`, {
  method: 'POST',
  body: JSON.stringify({ sub: BUYER, groups: ['estudiante'] }),
})
const buyerCookie = `edtech_access=${((await buyerToken.json()) as { access_token: string }).access_token}; ${visit}`
const order = await request('/api/checkout/crear', buyerCookie, 'POST', {
  cursoId: COURSE,
  cursoSlug: 'python-aplicado-demo',
})
if (order.status === 200) {
  const capture = await request('/api/checkout/capturar', buyerCookie, 'POST', {
    ordenId: order.data.ordenId,
  })
  if (capture.status !== 200) throw new Error('No se pudo confirmar la compra simulada')
  await waitFor('ingreso por compra desde la web', async () => {
    const r = await request('/api/afiliados/ingresos', anaCookie)
    return r.data.data?.totalCentavos >= 200
  })
  await waitFor('aviso real de venta en MQTT', async () => {
    const r = await request('/api/afiliados/terminal', anaCookie)
    return r.data.data?.terminal?.ultimoAviso === 'Nueva venta confirmada'
  })
  console.log('OK compra desde la web: QR → referencia → USD 40 → ingreso USD 2 → aviso MQTT')
} else if (order.status === 409 && order.data.error === `Ya compraste el curso ${COURSE}`) {
  console.log('La compra de demostración ya existía; no se agregó otra venta')
} else
  throw new Error(
    `No se pudo crear la compra de demo: ${order.status} ${JSON.stringify(order.data)}`,
  )
const summary = await request('/api/afiliados/ingresos', anaCookie)
if (summary.data.data.totalCentavos < 200) throw new Error('La demo no registró el ingreso de Ana')
console.log(
  'Demo lista: Ana tiene su QR, ingresos, notificación y terminal. Bruno sigue disponible para otra compra manual.',
)
