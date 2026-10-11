import { importPKCS8, SignJWT } from 'jose'
import type { Atribucion } from '../../domain/entities/afiliado.entity'
import type { FirmadorAtribucion } from '../../domain/ports-out/afiliados.repository'
export class FirmadorEd25519 implements FirmadorAtribucion {
  constructor(private readonly pem: string) {}
  async firmar(datos: Atribucion): Promise<string> {
    return new SignJWT({ ...datos })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'referral-v1' })
      .setSubject(datos.compradorId)
      .setIssuer('edtech-referrals')
      .setAudience('payments')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(await importPKCS8(this.pem, 'EdDSA'))
  }
}
