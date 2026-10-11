import { readFile, writeFile } from 'node:fs/promises'
const API = process.env.AFFILIATES_E2E_API ?? 'http://localhost:8180'
const JWT = process.env.AFFILIATES_E2E_JWT ?? 'http://localhost:4699'
for (const u of [API, JWT])
  if (!['localhost', '127.0.0.1', 'gateway', 'jwt-local'].includes(new URL(u).hostname))
    throw new Error('Solo pruebas locales')
const sub = '00000000-0000-4000-8000-000000000002'
const auth = await fetch(`${JWT}/token`, {
  method: 'POST',
  body: JSON.stringify({ sub, groups: ['estudiante'] }),
})
const token = ((await auth.json()) as { access_token: string }).access_token
type Terminal = {
  version: string
  versionReportada: string | null
  conectado: boolean
  mensaje: string
  habilitado: boolean
}
async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: body ? 'PUT' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!r.ok) throw new Error(`Falló ${path}: ${r.status}`)
  return ((await r.json()) as { data: T }).data
}
const phase = process.argv[2]
if (phase === 'offline') {
  const snapshot = {
    refId: (await call<{ refId: string }>('/api/affiliates/me')).refId,
    income: (await call<{ totalCentavos: number }>('/api/affiliates/ingresos')).totalCentavos,
  }
  await writeFile('/repo/.local/affiliate-reconnect-test.json', JSON.stringify(snapshot))
  let terminal
  for (let i = 0; i < 120; i++) {
    terminal = (await call<{ terminal: Terminal }>('/api/iot/me')).terminal
    if (terminal && !terminal.conectado) break
    await Bun.sleep(1000)
  }
  if (!terminal || terminal.conectado) throw new Error('El heartbeat no detectó la desconexión')
  await call('/api/iot/me', {
    version: terminal.version,
    mensaje: 'Aprende Python con mi recomendación',
    habilitado: true,
  })
  terminal = (await call('/api/iot/me')).terminal
  if (terminal.version === terminal.versionReportada)
    throw new Error('La configuración pendiente se reportó como aplicada sin dispositivo')
  console.log('OK terminal desconectado y nueva configuración pendiente; los ingresos se conservan')
} else if (phase === 'online') {
  let ready = false
  for (let i = 0; i < 60; i++) {
    const t = (await call<{ terminal: Terminal }>('/api/iot/me')).terminal
    if (
      t?.conectado &&
      t.version === t.versionReportada &&
      t.mensaje === 'Aprende Python con mi recomendación'
    ) {
      ready = true
      break
    }
    await Bun.sleep(1000)
  }
  if (!ready) throw new Error('El terminal no recuperó la configuración pendiente')
  const snapshot = JSON.parse(
    await readFile('/repo/.local/affiliate-reconnect-test.json', 'utf8'),
  ) as {
    refId: string
    income: number
  }
  if (
    (await call<{ refId: string }>('/api/affiliates/me')).refId !== snapshot.refId ||
    (await call<{ totalCentavos: number }>('/api/affiliates/ingresos')).totalCentavos !==
      snapshot.income
  )
    throw new Error('La reconexión cambió el QR o el ingreso')
  console.log('OK reconexión MQTT aplica el cambio y conserva QR e ingresos')
} else throw new Error('Selecciona offline u online')
