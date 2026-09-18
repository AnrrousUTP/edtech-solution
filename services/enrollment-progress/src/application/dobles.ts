import { Ok, type Result, type UniqueId } from '@edtech/shared-kernel'
import type { Matricula } from '../domain/entities/matricula.entity'
import type { IntentoEvaluacion } from '../domain/entities/intento-evaluacion.entity'
import type { BancoNoDisponibleError } from '../domain/module.errors'
import type {
  BancoConRespuestas,
  BancoRespuestasPort,
} from '../domain/ports-out/banco-respuestas.port'
import type { CarreraPublicada, CarrerasPort } from '../domain/ports-out/carreras.port'
import type {
  CursoProyeccionRepository,
  ProyeccionEntrada,
} from '../domain/ports-out/curso-proyeccion.repository'
import type { IntentoRepository } from '../domain/ports-out/intento.repository'
import type { MatriculaRepository } from '../domain/ports-out/matricula.repository'
import { CursoProyectado, type TomoProyectado } from '../domain/value-objects/curso-proyectado.vo'

export class InMemoryMatriculaRepository implements MatriculaRepository {
  readonly guardadas = new Map<string, Matricula>()
  readonly aprobadas = new Map<string, number>() // tomoId → puntaje
  readonly cursosCompletados = new Map<string, Set<string>>() // usuarioId → cursoIds
  readonly completadasPorMatricula = new Set<string>()

  async porId(id: UniqueId): Promise<Matricula | null> {
    return this.guardadas.get(id.valor) ?? null
  }
  async porUsuarioYCurso(usuarioId: UniqueId, cursoId: UniqueId): Promise<Matricula | null> {
    return (
      [...this.guardadas.values()].find(
        m => m.usuarioId.valor === usuarioId.valor && m.cursoId.valor === cursoId.valor,
      ) ?? null
    )
  }
  async porUsuario(usuarioId: UniqueId): Promise<Matricula[]> {
    return [...this.guardadas.values()].filter(m => m.usuarioId.valor === usuarioId.valor)
  }
  async guardar(m: Matricula): Promise<void> {
    this.guardadas.set(m.id.valor, m)
  }
  async evaluacionAprobada(
    _u: UniqueId,
    tomoId: string,
  ): Promise<{ aprobada: boolean; puntaje: number }> {
    const puntaje = this.aprobadas.get(tomoId)
    return { aprobada: puntaje !== undefined, puntaje: puntaje ?? 0 }
  }
  async cursosCompletadosDe(usuarioId: UniqueId): Promise<string[]> {
    return [...(this.cursosCompletados.get(usuarioId.valor) ?? [])]
  }
  async marcarCursoCompletado(matriculaId: UniqueId, cursoId: string): Promise<void> {
    this.completadasPorMatricula.add(matriculaId.valor)
    const m = this.guardadas.get(matriculaId.valor)
    if (m) {
      const set = this.cursosCompletados.get(m.usuarioId.valor) ?? new Set()
      set.add(cursoId)
      this.cursosCompletados.set(m.usuarioId.valor, set)
    }
  }
  async cursoYaCompletado(matriculaId: UniqueId): Promise<boolean> {
    return this.completadasPorMatricula.has(matriculaId.valor)
  }
}

export class InMemoryIntentoRepository implements IntentoRepository {
  readonly guardados = new Map<string, IntentoEvaluacion>()

  async porId(id: UniqueId): Promise<IntentoEvaluacion | null> {
    return this.guardados.get(id.valor) ?? null
  }
  async guardar(i: IntentoEvaluacion): Promise<void> {
    this.guardados.set(i.id.valor, i)
  }
  async ultimoNivelacionDe(): Promise<IntentoEvaluacion | null> {
    return null
  }
  async ultimoEvaluacionInicialDe(
    usuarioId: UniqueId,
    _cursoId: UniqueId,
  ): Promise<IntentoEvaluacion | null> {
    return (
      [...this.guardados.values()]
        .filter(
          i =>
            i.usuarioId.valor === usuarioId.valor &&
            i.tipo === 'EVALUACION_INICIAL' &&
            i.estado === 'ENTREGADO',
        )
        .sort((a, b) => b.iniciadoAt.getTime() - a.iniciadoAt.getTime())[0] ?? null
    )
  }
}

export class InMemoryProyeccionRepository implements CursoProyeccionRepository {
  readonly cursos = new Map<string, CursoProyectado>()

  sembrar(curso: CursoProyectado): void {
    this.cursos.set(curso.cursoId, curso)
  }
  async porId(cursoId: string): Promise<CursoProyectado | null> {
    return this.cursos.get(cursoId) ?? null
  }
  async guardar(entrada: ProyeccionEntrada): Promise<void> {
    const estructura = entrada.estructura as {
      tomoId: string
      orden: number
      titulo: string
      umbral: number
      lecciones: { id: string }[]
    }[]
    const tomos: TomoProyectado[] = estructura.map(t => ({
      id: t.tomoId,
      orden: t.orden,
      titulo: t.titulo,
      umbral: t.umbral,
      leccionIds: t.lecciones.map(l => l.id),
    }))
    this.cursos.set(
      entrada.cursoId,
      new CursoProyectado(
        entrada.cursoId,
        entrada.titulo,
        entrada.slug,
        entrada.publicado,
        entrada.precio,
        entrada.nivelMax,
        tomos,
      ),
    )
  }
  async marcarPublicado(cursoId: string, publicado: boolean): Promise<void> {
    const c = this.cursos.get(cursoId)
    if (c)
      this.cursos.set(
        cursoId,
        new CursoProyectado(c.cursoId, c.titulo, c.slug, publicado, c.precio, c.nivelMax, [
          ...c.tomos,
        ]),
      )
  }
  async actualizarTomo(): Promise<void> {}
}

export class FakeBancoRespuestas implements BancoRespuestasPort {
  constructor(private readonly banco: BancoConRespuestas) {}

  async respuestasDe(): Promise<Result<BancoConRespuestas, BancoNoDisponibleError>> {
    return Ok(this.banco)
  }
}

export class FakeCarreras implements CarrerasPort {
  constructor(private readonly carreras: CarreraPublicada[] = []) {}

  async carrerasPublicadas(): Promise<CarreraPublicada[]> {
    return this.carreras
  }
}
