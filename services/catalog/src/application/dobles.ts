import type { UniqueId } from '@edtech/shared-kernel'
import type { Curso } from '../domain/entities/curso.entity'
import type { Bloque, CursoRepository, Ejercicio } from '../domain/ports-out/curso.repository'
import type { ContenidoStore } from '../domain/ports-out/contenido-store.port'

export class InMemoryCursoRepository implements CursoRepository {
  readonly cursos = new Map<string, Curso>()
  readonly bloques = new Map<string, Bloque[]>()
  readonly ejercicios = new Map<string, Ejercicio[]>()

  async porId(id: UniqueId): Promise<Curso | null> {
    return this.cursos.get(id.valor) ?? null
  }
  async porSlug(slug: string): Promise<Curso | null> {
    return [...this.cursos.values()].find(c => c.slug.valor === slug) ?? null
  }
  async guardar(curso: Curso): Promise<void> {
    this.cursos.set(curso.id.valor, curso)
  }
  async reemplazarBloques(leccionId: UniqueId, bloques: Bloque[]): Promise<void> {
    this.bloques.set(leccionId.valor, bloques)
  }
  async bloquesDe(leccionId: UniqueId): Promise<Bloque[]> {
    return this.bloques.get(leccionId.valor) ?? []
  }
  async reemplazarEjercicios(leccionId: UniqueId, ejercicios: Ejercicio[]): Promise<void> {
    this.ejercicios.set(leccionId.valor, ejercicios)
  }
  async ejerciciosDe(leccionId: UniqueId): Promise<Ejercicio[]> {
    return this.ejercicios.get(leccionId.valor) ?? []
  }
}

export class FakeContenidoStore implements ContenidoStore {
  readonly publicados = new Map<string, string>()

  async publicarContenidoLeccion(leccionId: string, contenido: string): Promise<string> {
    const key = `contenido/${leccionId}.json`
    this.publicados.set(key, contenido)
    return `s3://fake/${key}`
  }
}
