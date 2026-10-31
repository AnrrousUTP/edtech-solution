import type { Command, SobreEvento } from '@edtech/shared-kernel'
import type { CrearUsuarioCommand } from '../../../application/crear-usuario/crear-usuario.handler'

/** Mensaje INTERNO (no viaja por el bus): la Lambda post-confirmation de Cognito
 *  lo encola directo en sqs-identity (A-12, camino del doc 08 §4.1). */
export const onAltaUsuarioCognito = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: CrearUsuarioCommand = {
    _tag: 'CrearUsuario',
    sub: String(p.sub),
    email: String(p.email),
    nombreVisible: String(p.nombreVisible ?? ''),
    rol: ['ESTUDIANTE', 'DOCENTE', 'AFILIADO'].includes(String(p.rol))
      ? (String(p.rol) as 'ESTUDIANTE' | 'DOCENTE' | 'AFILIADO')
      : 'ESTUDIANTE',
  }
  return cmd
}
