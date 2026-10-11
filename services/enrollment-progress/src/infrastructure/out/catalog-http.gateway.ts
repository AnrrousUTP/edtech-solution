import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { BancoNoDisponibleError } from '../../domain/module.errors'
import type {
  BancoConRespuestas,
  BancoRespuestasPort,
} from '../../domain/ports-out/banco-respuestas.port'
import type { CarreraPublicada, CarrerasPort } from '../../domain/ports-out/carreras.port'

export class CatalogRespuestasGateway implements BancoRespuestasPort {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}
  async respuestasDe(bancoId: string): Promise<Result<BancoConRespuestas, BancoNoDisponibleError>> {
    try {
      const r = await fetch(`${this.baseUrl}/api/catalog/interno/bancos/${bancoId}/respuestas`, {
        headers: { 'x-interno-token': this.token },
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) return Err(new BancoNoDisponibleError(`catalog respondió ${r.status}`))
      const body = (await r.json()) as { data?: BancoConRespuestas }
      if (!body.data) return Err(new BancoNoDisponibleError('respuesta sin datos'))
      return Ok(body.data)
    } catch (error) {
      return Err(
        new BancoNoDisponibleError(error instanceof Error ? error.message : 'sin conexión'),
      )
    }
  }
}

export class CatalogCarrerasGateway implements CarrerasPort {
  constructor(private readonly baseUrl: string) {}
  async carrerasPublicadas(): Promise<CarreraPublicada[]> {
    const r = await fetch(`${this.baseUrl}/api/catalog/carreras`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return []
    const body = (await r.json()) as {
      data?: { id: string; titulo: string; cursos: { cursoId: string }[] }[]
    }
    return (body.data ?? []).map(c => ({
      carreraId: c.id,
      titulo: c.titulo,
      cursoIds: c.cursos.map(x => x.cursoId),
    }))
  }
}
