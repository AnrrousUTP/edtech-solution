import { Err, Ok, type Result, type UniqueId } from '@edtech/shared-kernel'
import type { MazoFlashcards, Tarjeta } from '../domain/entities/mazo-flashcards.entity'
import { GeneracionError } from '../domain/module.errors'
import type { ColaGeneracion, ContenidoFuente } from '../domain/ports-out/contenido-fuente.port'
import type {
  EntradaGeneracion,
  GeneradorFlashcardsPort,
  SalidaGeneracion,
} from '../domain/ports-out/generador-flashcards.port'
import type { MazoRepository } from '../domain/ports-out/mazo.repository'

export class InMemoryMazoRepository implements MazoRepository {
  readonly mazos = new Map<string, MazoFlashcards>()

  async porId(id: UniqueId): Promise<MazoFlashcards | null> {
    return this.mazos.get(id.valor) ?? null
  }
  async porTomoYHash(tomoId: string, contenidoHash: string): Promise<MazoFlashcards | null> {
    return (
      [...this.mazos.values()].find(
        m => m.tomoId === tomoId && m.contenidoHash === contenidoHash,
      ) ?? null
    )
  }
  async ultimaVersionDe(tomoId: string): Promise<number> {
    const versiones = [...this.mazos.values()].filter(m => m.tomoId === tomoId).map(m => m.version)
    return versiones.length ? Math.max(...versiones) : 0
  }
  async porTomoParaAdmin(tomoId: string): Promise<MazoFlashcards[]> {
    return [...this.mazos.values()]
      .filter(m => m.tomoId === tomoId)
      .sort((a, b) => b.version - a.version)
  }
  /** Mismo criterio que el SQL real (I-8): mazo PUBLICADO + tarjeta PUBLICADA. */
  async porTomoParaEstudiante(tomoId: string): Promise<Tarjeta[]> {
    return [...this.mazos.values()]
      .filter(m => m.tomoId === tomoId && m.estado === 'PUBLICADO')
      .flatMap(m => m.tarjetas.filter(t => t.estado === 'PUBLICADA'))
  }
  async guardar(mazo: MazoFlashcards): Promise<void> {
    this.mazos.set(mazo.id.valor, mazo)
  }
}

export class FakeColaGeneracion implements ColaGeneracion {
  readonly encolados: string[] = []
  async encolar(mazoId: string): Promise<void> {
    this.encolados.push(mazoId)
  }
}

export class FakeContenidoFuente implements ContenidoFuente {
  constructor(private readonly contenido = 'contenido de prueba') {}
  async leer(): Promise<string> {
    return this.contenido
  }
}

/** Generador de test: sin retraso, tarjetas deterministas. */
export class GeneradorDePrueba implements GeneradorFlashcardsPort {
  llamadas = 0
  constructor(private readonly cantidad = 10) {}

  async generar(input: EntradaGeneracion): Promise<Result<SalidaGeneracion, GeneracionError>> {
    this.llamadas += 1
    return Ok({
      tarjetas: Array.from({ length: this.cantidad }, (_, i) => ({
        anverso: `Pregunta ${i + 1} sobre ${input.tomoTitulo}`,
        reverso: `Respuesta ${i + 1}`,
      })),
      modeloUsado: 'generador-de-prueba',
    })
  }
}

export class GeneradorQueFalla implements GeneradorFlashcardsPort {
  llamadas = 0
  async generar(): Promise<Result<SalidaGeneracion, GeneracionError>> {
    this.llamadas += 1
    return Err(new GeneracionError('el modelo no respondió'))
  }
}
