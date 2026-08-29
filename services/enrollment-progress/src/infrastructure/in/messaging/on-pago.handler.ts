import type { Command, SobreEvento } from '@edtech/shared-kernel'
import type {
  CrearMatriculaCommand,
  RevocarMatriculaCommand,
} from '../../../application/crear-matricula/crear-matricula.handler'

/** payments.pago-confirmado.v1 → habilita la matrícula. Sin lógica: traduce. */
export const onPagoConfirmado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: CrearMatriculaCommand = {
    _tag: 'CrearMatricula',
    usuarioId: String(p.usuarioId),
    cursoId: String(p.cursoId),
    origen: 'PAGO',
    ordenId: String(p.ordenId),
  }
  return cmd
}

/** payments.pago-reembolsado.v1 → revoca la matrícula. */
export const onPagoReembolsado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: RevocarMatriculaCommand = {
    _tag: 'RevocarMatricula',
    usuarioId: String(p.usuarioId),
    cursoId: String(p.cursoId),
  }
  return cmd
}
