import type {
  AfiliadosRepository,
  FirmadorAtribucion,
} from '../../domain/ports-out/afiliados.repository'
export class AfiliacionHandler {
  constructor(
    readonly repositorio: AfiliadosRepository,
    private readonly firmador: FirmadorAtribucion,
  ) {}
  async prueba(usuarioId: string, visitaId?: string): Promise<{ prueba: string | null }> {
    const atribucion = await this.repositorio.atribuir(usuarioId, visitaId)
    return { prueba: atribucion ? await this.firmador.firmar(atribucion) : null }
  }
}
