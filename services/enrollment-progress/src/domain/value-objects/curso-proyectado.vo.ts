// Proyección local del catálogo (D14): read model propio del dominio, nunca
// una fila de Drizzle ni una llamada a catalog en el camino caliente.
export type TomoProyectado = {
  id: string
  orden: number
  titulo: string
  umbral: number
  leccionIds: string[]
}

export class CursoProyectado {
  constructor(
    readonly cursoId: string,
    readonly titulo: string,
    readonly slug: string,
    readonly publicado: boolean,
    readonly precio: number,
    readonly nivelMax: string | null,
    readonly tomos: TomoProyectado[],
  ) {}

  tomoDeLeccion(leccionId: string): TomoProyectado | null {
    return this.tomos.find(t => t.leccionIds.includes(leccionId)) ?? null
  }

  tomoPorId(tomoId: string): TomoProyectado | null {
    return this.tomos.find(t => t.id === tomoId) ?? null
  }

  get esGratuito(): boolean {
    return this.precio === 0
  }
}
