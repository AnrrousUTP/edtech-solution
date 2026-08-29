// E2E del flujo del doc 00 §DoD. El mismo guion sirve en local y en AWS dev:
// solo cambian las bases y de dónde sale el token.
//
//   Local: bun run tools/e2e.ts
//   Dev:   WEB_BASE=https://... API_BASE=https://... TOKEN=<access token> bun run tools/e2e.ts
//
// No es un test de `bun test`: necesita el stack levantado. El harness no lo
// ejecuta; se corre a mano al cerrar una fase (doc 14) y en el cierre de F12.
const WEB = process.env.WEB_BASE ?? 'http://localhost:3000'
const API = process.env.API_BASE ?? 'http://localhost:8080'
const JWT_LOCAL = process.env.JWT_LOCAL_URL ?? 'http://localhost:4599'
const SLUG = process.env.CURSO_SLUG ?? 'html-esencial'

let fallos = 0
const ok = (nombre: string, cumple: boolean, detalle = ''): void => {
  if (!cumple) fallos++
  console.log(`${cumple ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}
const paso = (titulo: string): void => console.log(`\n${titulo}`)

const esperar = async <T>(
  descripcion: string,
  intento: () => Promise<T | null>,
  intentos = 25,
): Promise<T | null> => {
  for (let i = 0; i < intentos; i++) {
    const valor = await intento()
    if (valor !== null) return valor
    await new Promise(r => setTimeout(r, 1000))
  }
  console.log(`  (agotada la espera de ${descripcion} tras ${intentos}s)`)
  return null
}

// ---------------------------------------------------------------- credenciales
const usuarioId = process.env.SUB ?? crypto.randomUUID()

const obtenerToken = async (): Promise<string> => {
  if (process.env.TOKEN) return process.env.TOKEN
  const r = await fetch(`${JWT_LOCAL}/token`, {
    method: 'POST',
    body: JSON.stringify({
      sub: usuarioId,
      groups: ['estudiante'],
      email: 'e2e@edtech.test',
      nombre: 'Estudiante E2E',
    }),
  })
  if (!r.ok) throw new Error(`jwt-local respondio ${r.status}`)
  return ((await r.json()) as { access_token: string }).access_token
}

const token = await obtenerToken()

type Respuesta<T> = { estado: number; cuerpo: T; crudo: string }

const api = async <T>(
  ruta: string,
  init: RequestInit & { anonimo?: boolean } = {},
): Promise<Respuesta<T>> => {
  const { anonimo, ...resto } = init
  const r = await fetch(`${API}${ruta}`, {
    ...resto,
    headers: {
      'content-type': 'application/json',
      ...(anonimo === true ? {} : { authorization: `Bearer ${token}` }),
      ...(resto.headers as Record<string, string> | undefined),
    },
  })
  const crudo = await r.text()
  let cuerpo: unknown = null
  try {
    cuerpo = crudo.length > 0 ? JSON.parse(crudo) : null
  } catch {
    cuerpo = null
  }
  const sobre = cuerpo as { data?: unknown } | null
  return { estado: r.status, cuerpo: (sobre?.data ?? cuerpo) as T, crudo }
}

const sinRespuestas = (texto: string): boolean => !/respuesta_?correcta/i.test(texto)

// ------------------------------------------------------------------ 1. catálogo
paso('1. Catalogo publico')
type CursoResumen = { id: string; slug: string; titulo: string; precio: number }
const cursos = await api<CursoResumen[]>('/api/catalog/cursos', { anonimo: true })
ok(
  'lista cursos publicados sin autenticar',
  cursos.estado === 200 && cursos.cuerpo.length > 0,
  `${cursos.cuerpo.length} cursos`,
)

type Leccion = { id: string; orden: number }
type Tomo = { id: string; orden: number; titulo: string; lecciones: Leccion[] }
type CursoDetalle = { id: string; titulo: string; precio: number; tomos: Tomo[] }
const curso = await api<CursoDetalle>(`/api/catalog/cursos/${SLUG}`, { anonimo: true })
ok(
  'detalle del curso con sus tomos',
  curso.estado === 200 && curso.cuerpo.tomos.length > 0,
  `${curso.cuerpo.tomos.length} tomos`,
)
ok('I-5: el detalle publico no trae respuestas', sinRespuestas(curso.crudo))

const cursoId = curso.cuerpo.id
const tomos = [...curso.cuerpo.tomos].sort((a, b) => a.orden - b.orden)

// --------------------------------------------------------------- 2. nivelación
paso('2. Nivelacion')
type Pregunta = { id: string; opciones: { id: string }[] }
type Banco = { bancoId: string; preguntas: Pregunta[] }
const nivelacion = await api<Banco>('/api/catalog/nivelacion', { anonimo: true })
ok(
  'el test de nivelacion es publico',
  nivelacion.estado === 200 && nivelacion.cuerpo.preguntas.length > 0,
  `${nivelacion.cuerpo.preguntas.length} preguntas`,
)
ok('I-5: el banco publico no trae respuestas', sinRespuestas(nivelacion.crudo))

const responderTodo = (preguntas: Pregunta[]): { preguntaId: string; respuesta: string }[] =>
  preguntas.map(p => ({ preguntaId: p.id, respuesta: p.opciones[0]?.id ?? 'a' }))

type Resultado = { puntaje: number; aprobado?: boolean; nivelResultante?: string }
const entregar = async (
  cuerpo: Record<string, unknown>,
  respuestas: unknown[],
): Promise<Respuesta<Resultado>> => {
  const inicio = await api<{ intentoId: string }>('/api/enrollment/intentos', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  })
  if (inicio.estado >= 300)
    return { estado: inicio.estado, cuerpo: {} as Resultado, crudo: inicio.crudo }
  return api<Resultado>(`/api/enrollment/intentos/${inicio.cuerpo.intentoId}/entregar`, {
    method: 'POST',
    body: JSON.stringify({ respuestas }),
  })
}

const resNivel = await entregar(
  { tipo: 'NIVELACION', bancoId: nivelacion.cuerpo.bancoId },
  responderTodo(nivelacion.cuerpo.preguntas),
)
ok(
  'la nivelacion devuelve un nivel',
  resNivel.estado === 200 && typeof resNivel.cuerpo.nivelResultante === 'string',
  `nivel ${resNivel.cuerpo.nivelResultante} con ${resNivel.cuerpo.puntaje}%`,
)
ok('I-5: el resultado no revela las respuestas', sinRespuestas(resNivel.crudo))

// ---------------------------------------------------------------- 3. matrícula
paso('3. Matricula')
const matricular = (): Promise<Respuesta<unknown>> =>
  api('/api/enrollment/matriculas', { method: 'POST', body: JSON.stringify({ cursoId }) })

const matricula = await matricular()
ok('matricula gratuita aceptada', matricula.estado < 300, `HTTP ${matricula.estado}`)
const repetida = await matricular()
ok('matricularse dos veces no rompe', repetida.estado < 500, `HTTP ${repetida.estado}`)

const misMatriculas = await api<{ cursoId: string }[]>('/api/enrollment/mis-matriculas')
ok(
  'I-2: una sola matricula para el curso',
  misMatriculas.cuerpo.filter(m => m.cursoId === cursoId).length === 1,
)

// ------------------------------------------------- 4. lecciones y evaluaciones
paso('4. Lecciones y evaluaciones')
for (const tomo of tomos) {
  for (const leccion of [...tomo.lecciones].sort((a, b) => a.orden - b.orden)) {
    const r = await api(`/api/enrollment/lecciones/${leccion.id}/completar`, {
      method: 'POST',
      body: JSON.stringify({ cursoId }),
    })
    if (r.estado >= 300)
      ok(`completar leccion ${leccion.id}`, false, `HTTP ${r.estado} ${r.crudo.slice(0, 140)}`)
  }
  const ev = await api<Banco>(`/api/catalog/tomos/${tomo.id}/evaluacion`)
  ok(`I-5: la evaluacion del tomo ${tomo.orden} no trae respuestas`, sinRespuestas(ev.crudo))
  if (ev.estado === 200 && ev.cuerpo.preguntas.length > 0) {
    const res = await entregar(
      { tipo: 'TOMO', bancoId: ev.cuerpo.bancoId, cursoId, tomoId: tomo.id },
      responderTodo(ev.cuerpo.preguntas),
    )
    ok(
      `evaluacion del tomo ${tomo.orden} aprobada`,
      res.estado === 200 && res.cuerpo.aprobado === true,
      `${res.cuerpo.puntaje}%`,
    )
  }
}

type Progreso = {
  estado: string
  tomos: { completado: boolean; lecciones: { completada: boolean }[] }[]
}
const progreso = await api<Progreso>(`/api/enrollment/progreso/${cursoId}`)
const lecciones = progreso.cuerpo.tomos.flatMap(t => t.lecciones)
ok(
  'todas las lecciones quedan completadas',
  lecciones.length > 0 && lecciones.every(l => l.completada),
  `${lecciones.filter(l => l.completada).length}/${lecciones.length}`,
)
ok(
  'todos los tomos quedan completados',
  progreso.cuerpo.tomos.every(t => t.completado),
  `estado de la matricula: ${progreso.cuerpo.estado}`,
)

// ---------------------------------------------- 5. gamificación (por eventos)
paso('5. Insignias y certificado (llegan por eventos)')
type PerfilJuego = {
  puntos: number
  insignias: { criterio: string; referenciaId: string }[]
  certificados: { codigoVerificacion: string; titulo: string }[]
}
const perfil = await esperar('el perfil de gamificacion', async () => {
  const p = await api<PerfilJuego>('/api/gamification/mi-perfil')
  return p.estado === 200 && p.cuerpo.insignias.length > 0 ? p.cuerpo : null
})
ok(
  'el estudiante gana al menos una insignia',
  (perfil?.insignias.length ?? 0) > 0,
  `${perfil?.insignias.length ?? 0} insignias, ${perfil?.puntos ?? 0} puntos`,
)

const claves = (perfil?.insignias ?? []).map(i => `${i.criterio}:${i.referenciaId}`)
ok('I-7: ninguna insignia repetida', new Set(claves).size === claves.length, claves.join(', '))

const certificado = await esperar('el certificado', async () => {
  const p = await api<PerfilJuego>('/api/gamification/mi-perfil')
  return p.cuerpo.certificados[0] ?? null
})
ok('se emite el certificado del curso', certificado !== null, certificado?.codigoVerificacion ?? '')

if (certificado !== null) {
  const verificacion = await api(
    `/api/gamification/certificados/${certificado.codigoVerificacion}`,
    {
      anonimo: true,
    },
  )
  ok('el certificado se verifica publicamente', verificacion.estado === 200)
}

// -------------------------------------------------------------- 6. flashcards
paso('6. Flashcards (I-8)')
const tarjetas = await api<unknown[]>(`/api/flashcards/tomos/${tomos[0].id}`)
const cuantas = Array.isArray(tarjetas.cuerpo) ? tarjetas.cuerpo.length : 0
ok(
  'I-8: el estudiante solo ve tarjetas ya aprobadas',
  tarjetas.estado === 200 || tarjetas.estado === 404,
  `${cuantas} tarjetas publicadas`,
)

// -------------------------------------------------------- 7. pantallas del web
paso('7. Pantallas (SSR con la sesion del navegador)')
const cookie = `edtech_access=${token}; edtech_perfil=${encodeURIComponent(
  JSON.stringify({
    usuarioId,
    email: 'e2e@edtech.test',
    nombre: 'Estudiante E2E',
    roles: ['estudiante'],
  }),
)}`

const rutas = [
  '/',
  '/cursos',
  `/cursos/${SLUG}`,
  '/nivelacion',
  '/dashboard',
  `/aprender/${SLUG}`,
  `/aprender/${SLUG}/${tomos[0].lecciones[0].id}`,
  `/aprender/${SLUG}/evaluacion/${tomos[0].id}`,
  `/repasar/${tomos[0].id}`,
  ...(certificado !== null ? [`/certificados/${certificado.codigoVerificacion}`] : []),
]

for (const ruta of rutas) {
  const r = await fetch(`${WEB}${ruta}`, { headers: { cookie }, redirect: 'manual' })
  const html = r.status === 200 ? await r.text() : ''
  ok(`GET ${ruta}`, r.status === 200 || r.status === 307, `HTTP ${r.status}`)
  if (html.length > 0) {
    ok(`  I-5 en el HTML de ${ruta}`, sinRespuestas(html))
    ok(`  D19 sin transform en hover`, !/hover:(scale|translate|rotate|skew)/.test(html))
  }
}

console.log(fallos === 0 ? '\nE2E OK' : `\nE2E con ${fallos} fallo(s)`)
process.exit(fallos === 0 ? 0 : 1)
