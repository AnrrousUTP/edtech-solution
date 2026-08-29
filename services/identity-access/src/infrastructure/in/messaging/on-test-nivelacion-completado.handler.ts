import type { Command, SobreEvento } from '@edtech/shared-kernel'
import type { FijarNivelPorTestCommand } from '../../../application/fijar-nivel-por-test/fijar-nivel-por-test.handler'

/** Traduce enrollment.test-nivelacion-completado.v1 → FijarNivelPorTest. */
export const onTestNivelacionCompletado = (sobre: SobreEvento): Command => {
  const p = sobre.payload
  const cmd: FijarNivelPorTestCommand = {
    _tag: 'FijarNivelPorTest',
    usuarioId: String(p.usuarioId),
    nivelResultante: String(p.nivelResultante),
  }
  return cmd
}
