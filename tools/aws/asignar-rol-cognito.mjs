import { execFileSync } from 'node:child_process'

const CUENTA_ESPERADA = '047600599757'
const ROLES = new Set(['estudiante', 'docente', 'afiliado'])
const GRUPOS_LEGADOS = new Set(['admin'])
const esGrupoAplicacion = groupName =>
  ROLES.has(groupName.toLowerCase()) || GRUPOS_LEGADOS.has(groupName.toLowerCase())
const [correoEntrada, rol, modo = 'plan', confirmacion] = process.argv.slice(2)
const correo = correoEntrada?.trim().toLowerCase()
const userPoolId = process.env.COGNITO_POOL_ID
const perfil = process.env.AWS_PROFILE ?? 'edtech'
const region = process.env.AWS_REGION ?? userPoolId?.split('_')[0] ?? 'us-east-1'

if (!correo || !/^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/.test(correo)) {
  throw new Error('Uso: node tools/aws/asignar-rol-cognito.mjs correo rol [plan|apply] [--confirm=correo]')
}
if (!rol || !ROLES.has(rol)) throw new Error('El rol debe ser estudiante, docente o afiliado.')
if (!['plan', 'apply'].includes(modo)) throw new Error('El modo debe ser plan o apply.')
if (!userPoolId) throw new Error('Configura COGNITO_POOL_ID para el User Pool destino.')
if (modo === 'apply' && perfil !== 'edtech')
  throw new Error('Para apply se requiere AWS_PROFILE=edtech.')
if (modo === 'apply' && confirmacion !== `--confirm=${correo}`)
  throw new Error('Para apply repite el correo exacto como --confirm=correo@dominio.')

const aws = (servicio, operacion, argumentos) =>
  execFileSync(
    'aws',
    [
      servicio,
      operacion,
      ...argumentos,
      '--profile',
      perfil,
      '--region',
      region,
      '--output',
      'json',
      '--no-cli-pager',
      '--cli-connect-timeout',
      '10',
      '--cli-read-timeout',
      '20',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 },
  )

const jsonAws = (servicio, operacion, argumentos) =>
  JSON.parse(aws(servicio, operacion, argumentos).trim() || '{}')

const identidad = jsonAws('sts', 'get-caller-identity', [])
if (identidad.Account !== CUENTA_ESPERADA)
  throw new Error(`Cuenta AWS inesperada (${identidad.Account ?? 'desconocida'}); se requiere ${CUENTA_ESPERADA}.`)

const usuarios = jsonAws('cognito-idp', 'list-users', [
  '--user-pool-id',
  userPoolId,
  '--filter',
  `email = "${correo}"`,
  '--limit',
  '2',
])
const coincidencias = (usuarios.Users ?? []).filter(user =>
  (user.Attributes ?? []).some(attribute => attribute.Name === 'email' && attribute.Value?.toLowerCase() === correo),
)
if (coincidencias.length !== 1) throw new Error('El correo debe corresponder a exactamente una cuenta Cognito.')
const username = coincidencias[0].Username
if (!username) throw new Error('Cognito devolvió una cuenta sin Username.')

jsonAws('cognito-idp', 'get-group', ['--user-pool-id', userPoolId, '--group-name', rol])

const listarGrupos = () => {
  const grupos = []
  let nextToken
  do {
    const argumentos = ['--user-pool-id', userPoolId, '--username', username]
    if (nextToken) argumentos.push('--next-token', nextToken)
    const pagina = jsonAws('cognito-idp', 'admin-list-groups-for-user', argumentos)
    for (const group of pagina.Groups ?? [])
      if (typeof group.GroupName === 'string') grupos.push(group.GroupName)
    nextToken = pagina.NextToken
  } while (nextToken)
  return [...new Set(grupos)].sort()
}

const gruposUnicos = listarGrupos()
const gruposDeAplicacion = gruposUnicos.filter(esGrupoAplicacion)
const otrosGrupos = gruposUnicos.filter(groupName => !esGrupoAplicacion(groupName))
const operaciones =
  gruposDeAplicacion.length === 1 && gruposDeAplicacion[0] === rol
    ? []
    : [
        ...gruposDeAplicacion.map(groupName => ({ accion: 'quitar grupo de aplicación', groupName })),
        { accion: 'asignar grupo', groupName: rol },
      ]

console.log(JSON.stringify({ modo, cuenta: identidad.Account, userPoolId, correo, username, rol, gruposAplicacionActuales: gruposDeAplicacion, otrosGruposConservados: otrosGrupos, operaciones }, null, 2))
if (modo === 'apply' && operaciones.length > 0) {
  for (const groupName of gruposDeAplicacion) {
    aws('cognito-idp', 'admin-remove-user-from-group', [
      '--user-pool-id',
      userPoolId,
      '--username',
      username,
      '--group-name',
      groupName,
    ])
  }
  aws('cognito-idp', 'admin-add-user-to-group', [
    '--user-pool-id',
    userPoolId,
    '--username',
    username,
    '--group-name',
    rol,
  ])
  const gruposFinales = listarGrupos()
  const rolesFinales = gruposFinales.filter(groupName => ROLES.has(groupName.toLowerCase()))
  const gruposLegadosFinales = gruposFinales.filter(groupName => GRUPOS_LEGADOS.has(groupName.toLowerCase()))
  const otrosGruposFinales = gruposFinales.filter(groupName => !esGrupoAplicacion(groupName))
  if (
    rolesFinales.length !== 1 ||
    rolesFinales[0]?.toLowerCase() !== rol ||
    gruposLegadosFinales.length > 0
  )
    throw new Error('La verificación final no confirma exactamente un grupo de aplicación.')
  if (otrosGruposFinales.join('\0') !== otrosGrupos.join('\0'))
    throw new Error('La verificación final detectó cambios en grupos Cognito ajenos a la aplicación.')
  console.log(`Cuenta ${correo}: rol único ${rol} confirmado.`)
}
