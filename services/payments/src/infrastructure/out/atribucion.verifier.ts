import { importSPKI, jwtVerify } from 'jose'
import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { AtribucionInvalidaError, type PaymentsError } from '../../domain/module.errors'
import type {
  AtribucionReferida,
  VerificadorAtribucionPort,
} from '../../domain/ports-out/atribucion.port'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export class VerificadorEd25519 implements VerificadorAtribucionPort {
  constructor(private readonly pem: string) {}
  async verificar(
    prueba: string,
    compradorId: string,
  ): Promise<Result<AtribucionReferida, PaymentsError>> {
    try {
      const { payload: p } = await jwtVerify(prueba, await importSPKI(this.pem, 'EdDSA'), {
        issuer: 'edtech-referrals',
        audience: 'payments',
        subject: compradorId,
        algorithms: ['EdDSA'],
        requiredClaims: ['exp', 'iat', 'sub'],
        maxTokenAge: '5m',
      })
      if (
        p.compradorId !== compradorId ||
        p.afiliadoUsuarioId === compradorId ||
        p.tasaBps !== 500 ||
        p.politica !== 'ultimo-referido-30d-v1' ||
        !['afiliadoId', 'afiliadoUsuarioId', 'visitaId', 'compradorId'].every(
          k => typeof p[k] === 'string' && uuid.test(String(p[k])),
        ) ||
        typeof p.refId !== 'string' ||
        !uuid.test(p.refId)
      )
        return Err(new AtribucionInvalidaError())
      return Ok({
        afiliadoId: String(p.afiliadoId),
        afiliadoUsuarioId: String(p.afiliadoUsuarioId),
        visitaId: String(p.visitaId),
        compradorId,
        refId: p.refId,
        politica: 'ultimo-referido-30d-v1',
        tasaBps: 500,
      })
    } catch {
      return Err(new AtribucionInvalidaError())
    }
  }
}
