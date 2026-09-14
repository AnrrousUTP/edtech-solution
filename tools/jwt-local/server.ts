// Emisor JWT local que imita la forma de los tokens de Cognito (doc 08 §8).
// El middleware del kernel valida contra COGNITO_ISSUER, así que el código de
// validación es el mismo en local y en AWS.
const PORT = 4599
const ISSUER = process.env.JWT_LOCAL_ISSUER ?? `http://jwt-local:${PORT}`
const CLIENT_ID = 'local-client'
const CONFIRMATION_CODE = process.env.JWT_LOCAL_CONFIRMATION_CODE ?? '123456'
const RECOVERY_CODE = process.env.JWT_LOCAL_RECOVERY_CODE ?? '654321'

type UsuarioLocal = {
  sub: string
  email: string
  nombre: string
  passwordHash: string
  confirmado: boolean
  grupos: string[]
  recoveryCode?: string
}

const usuarios = new Map<string, UsuarioLocal>()

const jsonBody = async (req: Request): Promise<Record<string, unknown>> =>
  (await req.json().catch(() => ({}))) as Record<string, unknown>

const emailNormalizado = (valor: unknown): string =>
  typeof valor === 'string' ? valor.trim().toLowerCase() : ''

const passwordHash = async (password: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Buffer.from(digest).toString('hex')
}

const passwordValido = (password: string): boolean =>
  password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)

const respuestaError = (mensaje: string, status = 400): Response =>
  Response.json({ error: mensaje }, { status })

// Cuenta fija solo para revisar el panel admin local. En AWS la pertenencia al
// grupo admin la gestiona Cognito y esta cuenta no existe.
usuarios.set('admin@edtech.test', {
  sub: '00000000-0000-4000-8000-000000000001',
  email: 'admin@edtech.test',
  nombre: 'Admin Local',
  passwordHash: await passwordHash('AdminLocal1'),
  confirmado: true,
  grupos: ['admin'],
})

const par = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
)
const kid = crypto.randomUUID()
const jwkPublica = {
  ...(await crypto.subtle.exportKey('jwk', par.publicKey)),
  kid,
  use: 'sig',
  alg: 'RS256',
}

const b64url = (data: Uint8Array | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return Buffer.from(bytes).toString('base64url')
}

async function firmar(claims: Record<string, unknown>): Promise<string> {
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }))
  const cuerpo = b64url(JSON.stringify(claims))
  const firma = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    par.privateKey,
    new TextEncoder().encode(`${cabecera}.${cuerpo}`),
  )
  return `${cabecera}.${cuerpo}.${b64url(new Uint8Array(firma))}`
}

async function tokensDe(usuario: UsuarioLocal): Promise<Response> {
  const ahora = Math.floor(Date.now() / 1000)
  const base = {
    sub: usuario.sub,
    email: usuario.email,
    name: usuario.nombre,
    nombre_visible: usuario.nombre,
    iss: ISSUER,
    client_id: CLIENT_ID,
    iat: ahora,
    exp: ahora + 3600,
    'cognito:groups': usuario.grupos,
  }
  const accessToken = await firmar({
    ...base,
    token_use: 'access',
    scope: 'openid profile email',
  })
  const idToken = await firmar({
    ...base,
    token_use: 'id',
    email: usuario.email,
    nombre_visible: usuario.nombre,
  })
  return Response.json({
    access_token: accessToken,
    id_token: idToken,
    token_type: 'Bearer',
    expires_in: 3600,
  })
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/.well-known/jwks.json') return Response.json({ keys: [jwkPublica] })
    if (url.pathname === '/health') return Response.json({ ok: true })

    if (url.pathname === '/register' && req.method === 'POST') {
      const body = await jsonBody(req)
      const email = emailNormalizado(body.email)
      const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!email || !email.includes('@')) return respuestaError('Escribe un email válido')
      if (!nombre) return respuestaError('Escribe tu nombre')
      if (!passwordValido(password)) {
        return respuestaError(
          'La contraseña necesita 10 caracteres, una mayúscula, una minúscula y un número',
        )
      }
      if (usuarios.has(email)) return respuestaError('Ya existe una cuenta con ese email', 409)
      usuarios.set(email, {
        sub: crypto.randomUUID(),
        email,
        nombre,
        passwordHash: await passwordHash(password),
        confirmado: false,
        grupos: ['estudiante'],
      })
      return Response.json({
        ok: true,
        requiereConfirmacion: true,
        codigoDesarrollo: CONFIRMATION_CODE,
      })
    }

    if (url.pathname === '/confirm' && req.method === 'POST') {
      const body = await jsonBody(req)
      const email = emailNormalizado(body.email)
      const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : ''
      const usuario = usuarios.get(email)
      if (!usuario) return respuestaError('No encontramos esa cuenta', 404)
      if (codigo !== CONFIRMATION_CODE)
        return respuestaError('El código de confirmación no es válido', 400)
      usuario.confirmado = true
      return Response.json({ ok: true })
    }

    if (url.pathname === '/login' && req.method === 'POST') {
      const body = await jsonBody(req)
      const email = emailNormalizado(body.email)
      const password = typeof body.password === 'string' ? body.password : ''
      const usuario = usuarios.get(email)
      if (!usuario || usuario.passwordHash !== (await passwordHash(password))) {
        return respuestaError('Email o contraseña incorrectos', 401)
      }
      if (!usuario.confirmado) return respuestaError('Confirma tu email antes de entrar', 403)
      return tokensDe(usuario)
    }

    if (url.pathname === '/forgot' && req.method === 'POST') {
      const body = await jsonBody(req)
      const email = emailNormalizado(body.email)
      const usuario = usuarios.get(email)
      if (!usuario) return respuestaError('No encontramos esa cuenta', 404)
      usuario.recoveryCode = RECOVERY_CODE
      return Response.json({ ok: true, codigoDesarrollo: RECOVERY_CODE })
    }

    if (url.pathname === '/reset' && req.method === 'POST') {
      const body = await jsonBody(req)
      const email = emailNormalizado(body.email)
      const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const usuario = usuarios.get(email)
      if (!usuario || usuario.recoveryCode !== codigo)
        return respuestaError('El código de recuperación no es válido')
      if (!passwordValido(password))
        return respuestaError(
          'La contraseña necesita 10 caracteres, una mayúscula, una minúscula y un número',
        )
      usuario.passwordHash = await passwordHash(password)
      usuario.recoveryCode = undefined
      return Response.json({ ok: true })
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
      const ahora = Math.floor(Date.now() / 1000)
      const sub = typeof body.sub === 'string' ? body.sub : crypto.randomUUID()
      const grupos = Array.isArray(body.groups) ? body.groups : ['estudiante']
      const base = {
        sub,
        iss: ISSUER,
        client_id: CLIENT_ID,
        iat: ahora,
        exp: ahora + 3600,
        'cognito:groups': grupos,
      }
      const accessToken = await firmar({
        ...base,
        token_use: 'access',
        scope: 'openid profile email',
      })
      const idToken = await firmar({
        ...base,
        token_use: 'id',
        email: typeof body.email === 'string' ? body.email : `${sub}@local.test`,
        nombre_visible: typeof body.nombre === 'string' ? body.nombre : 'Usuario Local',
      })
      return Response.json({
        access_token: accessToken,
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 3600,
      })
    }

    return new Response('No encontrado', { status: 404 })
  },
})

console.log(`jwt-local escuchando en :${PORT} (issuer ${ISSUER})`)
