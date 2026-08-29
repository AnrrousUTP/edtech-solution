import type { UniqueId } from '@edtech/shared-kernel'
import type { BancoPreguntas, UsoBanco } from '../entities/banco-preguntas.entity'

export interface BancoRepository {
  porId(id: UniqueId): Promise<BancoPreguntas | null>
  porUso(uso: UsoBanco, tomoId?: string): Promise<BancoPreguntas | null>
  guardar(banco: BancoPreguntas): Promise<void>
}
