// Emisor JWT local que imita la forma de los tokens de Cognito (doc 08 §8).
// El middleware del kernel valida contra COGNITO_ISSUER, así que el código de
// validación es el mismo en local y en AWS.
const PORT = 4599
const ISSUER = process.env.JWT_LOCAL_ISSUER ?? `http://jwt-local:${PORT}`
const CLIENT_ID = 'local-client'

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

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/.well-known/jwks.json') return Response.json({ keys: [jwkPublica] })
    if (url.pathname === '/health') return Response.json({ ok: true })

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
