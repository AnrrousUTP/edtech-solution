import { AggregateRoot, Err, Ok, type Result, UniqueId } from '@edtech/shared-kernel'
import { BancoInvalidoError, type CatalogError } from '../module.errors'

export type UsoBanco =
  'NIVELACION' | 'EVALUACION_INICIAL' | 'EVALUACION_TOMO' | 'DIAGNOSTICO_PREVIO' | 'REFUERZO'
export type TipoPregunta = 'OPCION_UNICA' | 'OPCION_MULTIPLE' | 'CODIGO' | 'VERDADERO_FALSO'

export type Pregunta = {
  id: string
  tipo: TipoPregunta
  nivel: string | null // obligatorio en bancos de NIVELACION
  enunciado: string
  opciones: { id: string; texto: string }[] // sin marcar la correcta
  respuestaCorrecta: unknown // NUNCA sale por la API pública (I-5)
  puntaje: number
}

type Props = {
  id: UniqueId
  uso: UsoBanco
  tomoId: string | null // NULL si uso = NIVELACION (CHECK del doc 03 §5)
  titulo: string
  preguntas: Pregunta[]
}

export class BancoPreguntas extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  static crear(datos: {
    uso: UsoBanco
    tomoId: string | null
    titulo: string
  }): Result<BancoPreguntas, CatalogError> {
    const necesitaTomo = datos.uso === 'EVALUACION_TOMO' || datos.uso === 'REFUERZO'
    if (necesitaTomo !== (datos.tomoId !== null))
      return Err(new BancoInvalidoError('Solo los bancos de tomo y refuerzo necesitan un tomo'))
    return Ok(
      new BancoPreguntas({
        id: UniqueId.nuevo(),
        uso: datos.uso,
        tomoId: datos.tomoId,
        titulo: datos.titulo,
        preguntas: [],
      }),
    )
  }

  static reconstruir(props: Props): BancoPreguntas {
    return new BancoPreguntas(props)
  }

  agregarPregunta(p: Omit<Pregunta, 'id'>): Result<string, CatalogError> {
    if (this.props.uso === 'NIVELACION' && !p.nivel)
      return Err(new BancoInvalidoError('Las preguntas de nivelación llevan nivel A-N'))
    if (p.puntaje < 1) return Err(new BancoInvalidoError('El puntaje mínimo es 1'))
    const id = UniqueId.nuevo().valor
    this.props.preguntas.push({ ...p, id })
    return Ok(id)
  }

  eliminarPregunta(id: string): void {
    this.props.preguntas = this.props.preguntas.filter(p => p.id !== id)
  }

  get id(): UniqueId {
    return this.props.id
  }
  get uso(): UsoBanco {
    return this.props.uso
  }
  get tomoId(): string | null {
    return this.props.tomoId
  }
  get titulo(): string {
    return this.props.titulo
  }
  get preguntas(): readonly Pregunta[] {
    return this.props.preguntas
  }
}
