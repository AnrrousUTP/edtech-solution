import { NextResponse } from 'next/server'
import {
  CognitoAuthError,
  confirmarEnCognito,
  confirmarResetCognito,
  iniciarSesionCognito,
  registrarEnCognito,
  responderRetoCognito,
  solicitarResetCognito,
} from '@/lib/cognito-auth'
import { config, destinoInterno, hayCognito } from '@/lib/config'
import { COOKIE_ACCESO, COOKIE_PERFIL, COOKIE_REFRESH, claimsDeToken } from '@/lib/sesion'

export const runtime = 'nodejs'

const errores: Record<string, string> = {
  UsernameExistsException: 'Ya existe una cuenta con ese correo.',
  AliasExistsException: 'Ya existe una cuenta con ese correo.',
  InvalidPasswordException:
    'La contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula y un número.',
  InvalidParameterException: 'Revisa los datos ingresados e inténtalo otra vez.',
  CodeMismatchException: 'El código no es correcto. Revísalo e inténtalo nuevamente.',
  ExpiredCodeException: 'El código venció. Solicita uno nuevo e inténtalo otra vez.',
  UserNotFoundException: 'No encontramos una cuenta con ese correo.',
  UserNotConfirmedException: 'Confirma tu correo antes de iniciar sesión.',
  NotAuthorizedException: 'Correo o contraseña incorrectos.',
  TooManyRequestsException: 'Hubo muchos intentos. Espera un momento antes de probar de nuevo.',
  LimitExceededException:
    'Se alcanzó el límite de intentos. Espera un momento e inténtalo de nuevo.',
}

const error = (err: unknown): Response => {
  if (err instanceof CognitoAuthError) {
    const status = ['TooManyRequestsException', 'LimitExceededException'].includes(err.code)
      ? 429
      : 400
    return NextResponse.json(
      { error: errores[err.code] ?? 'No se pudo completar la autenticación.' },
      { status },
    )
  }
  return NextResponse.json(
    { error: 'No se pudo conectar con el servicio de acceso. Inténtalo nuevamente.' },
    { status: 503 },
  )
}

const crearSesion = (
  resultado: { AccessToken?: string; IdToken?: string; RefreshToken?: string; ExpiresIn?: number },
  destino: string,
): Response => {
  if (!resultado.AccessToken)
    return NextResponse.json({ error: 'Cognito no devolvió una sesión válida.' }, { status: 502 })
  const perfilAcceso = claimsDeToken(resultado.AccessToken) ?? {}
  const perfilId = resultado.IdToken ? (claimsDeToken(resultado.IdToken) ?? {}) : {}
  const seguridad = {
    httpOnly: true,
    secure: config.appUrl.startsWith('https://') || config.production,
    sameSite: 'lax' as const,
    path: '/',
  }
  const edad = Math.max(60, resultado.ExpiresIn ?? 3600)
  const respuesta = NextResponse.json({ ok: true, destino })
  respuesta.cookies.set(COOKIE_ACCESO, resultado.AccessToken, { ...seguridad, maxAge: edad })
  if (resultado.RefreshToken)
    respuesta.cookies.set(COOKIE_REFRESH, resultado.RefreshToken, {
      ...seguridad,
      maxAge: 30 * 24 * 3600,
    })
  respuesta.cookies.set(
    COOKIE_PERFIL,
    encodeURIComponent(
      JSON.stringify({
        usuarioId: String(perfilAcceso.sub ?? ''),
        email: String(perfilId.email ?? perfilAcceso.username ?? ''),
        nombre: String(
          perfilId['custom:nombre_visible'] ??
            perfilId.nombre_visible ??
            perfilId.name ??
            perfilId.email ??
            'Estudiante',
        ),
        roles: Array.isArray(perfilAcceso['cognito:groups']) ? perfilAcceso['cognito:groups'] : [],
        mfaPendiente: String(perfilId.mfa_pendiente ?? '') === 'true',
      }),
    ),
    { ...seguridad, httpOnly: false, maxAge: edad },
  )
  return respuesta
}

const valido = (valor: unknown, minimo = 1, maximo = 256): valor is string =>
  typeof valor === 'string' && valor.trim().length >= minimo && valor.length <= maximo

export const POST = async (peticion: Request): Promise<Response> => {
  if (!hayCognito())
    return NextResponse.json({ error: 'El acceso AWS no está configurado.' }, { status: 503 })
  const origen = peticion.headers.get('origin')
  const origenEsperado = new URL(config.appUrl).origin
  if (origen && origen !== origenEsperado)
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 })

  const cuerpo = (await peticion.json().catch(() => null)) as Record<string, unknown> | null
  if (
    !cuerpo ||
    !valido(cuerpo.accion, 1, 32) ||
    !valido(cuerpo.email, 3, 254) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cuerpo.email)
  ) {
    return NextResponse.json({ error: 'Ingresa un correo válido.' }, { status: 400 })
  }
  const email = cuerpo.email.trim().toLowerCase()
  const destino = destinoInterno(typeof cuerpo.destino === 'string' ? cuerpo.destino : null)

  try {
    if (cuerpo.accion === 'register') {
      if (!valido(cuerpo.nombre, 1, 80) || !valido(cuerpo.password, 10, 256))
        return NextResponse.json(
          { error: 'Completa tu nombre y una contraseña de al menos 10 caracteres.' },
          { status: 400 },
        )
      const resultado = await registrarEnCognito(cuerpo.nombre.trim(), email, cuerpo.password)
      return NextResponse.json({ ok: true, confirmado: resultado.UserConfirmed ?? false })
    }
    if (cuerpo.accion === 'confirm') {
      if (typeof cuerpo.codigo !== 'string' || !/^\d{6}$/.test(cuerpo.codigo))
        return NextResponse.json(
          { error: 'Ingresa el código de 6 dígitos enviado a tu correo.' },
          { status: 400 },
        )
      await confirmarEnCognito(email, cuerpo.codigo)
      return NextResponse.json({ ok: true })
    }
    if (cuerpo.accion === 'forgot') {
      await solicitarResetCognito(email)
      return NextResponse.json({ ok: true })
    }
    if (cuerpo.accion === 'reset') {
      if (
        typeof cuerpo.codigo !== 'string' ||
        !/^\d{6}$/.test(cuerpo.codigo) ||
        !valido(cuerpo.password, 10, 256)
      )
        return NextResponse.json(
          { error: 'Ingresa el código de 6 dígitos y una contraseña de al menos 10 caracteres.' },
          { status: 400 },
        )
      await confirmarResetCognito(email, cuerpo.codigo, cuerpo.password)
      return NextResponse.json({ ok: true })
    }
    if (cuerpo.accion === 'challenge') {
      if (
        !valido(cuerpo.session, 1, 4096) ||
        !['SOFTWARE_TOKEN_MFA', 'NEW_PASSWORD_REQUIRED'].includes(String(cuerpo.challengeName))
      )
        return NextResponse.json(
          { error: 'La verificación expiró. Inicia sesión otra vez.' },
          { status: 400 },
        )
      const resultado = await responderRetoCognito(
        email,
        cuerpo.session,
        String(cuerpo.challengeName),
        typeof cuerpo.codigo === 'string' ? cuerpo.codigo : undefined,
        typeof cuerpo.password === 'string' ? cuerpo.password : undefined,
      )
      if (resultado.AuthenticationResult)
        return crearSesion(resultado.AuthenticationResult, destino)
      if (resultado.ChallengeName && resultado.Session)
        return NextResponse.json({ reto: resultado.ChallengeName, session: resultado.Session })
      return NextResponse.json(
        { error: 'Cognito requiere un paso de autenticación no disponible.' },
        { status: 400 },
      )
    }
    if (cuerpo.accion === 'login') {
      if (!valido(cuerpo.password, 1, 256))
        return NextResponse.json({ error: 'Ingresa tu contraseña.' }, { status: 400 })
      const resultado = await iniciarSesionCognito(email, cuerpo.password)
      if (resultado.AuthenticationResult)
        return crearSesion(resultado.AuthenticationResult, destino)
      if (resultado.ChallengeName && resultado.Session)
        return NextResponse.json({ reto: resultado.ChallengeName, session: resultado.Session })
      return NextResponse.json(
        { error: 'Cognito requiere un paso de autenticación no disponible.' },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'Acción de autenticación no válida.' }, { status: 400 })
  } catch (err) {
    return error(err)
  }
}
