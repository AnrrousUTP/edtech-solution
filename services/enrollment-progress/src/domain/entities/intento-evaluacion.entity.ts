import { AggregateRoot, Err, Ok, type Result, UniqueId } from '@edtech/shared-kernel'
import { EvaluacionAprobadaEvent } from '../events/evaluacion-aprobada.event'
import { EvaluacionReprobadaEvent } from '../events/evaluacion-reprobada.event'
import { TestNivelacionCompletadoEvent } from '../events/test-nivelacion-completado.event'
import { IntentoYaEntregadoError, type EnrollmentError } from '../module.errors'
import {
  corregir,
  nivelResultante,
  type PreguntaCorrecta,
  type RespuestaDada,
} from '../services/correccion.service'

export type TipoEvaluacion =
  'NIVELACION' | 'TOMO' | 'DIAGNOSTICO_PREVIO' | 'EVALUACION_INICIAL' | 'REFUERZO'
export type EstadoIntento = 'EN_CURSO' | 'ENTREGADO'

type Props = {
  id: UniqueId
  usuarioId: UniqueId
  tipo: TipoEvaluacion
  bancoId: UniqueId
  matriculaId: UniqueId | null // NULL en NIVELACION (CHECK doc 03 §6)
  tomoId: string | null
  estado: EstadoIntento
  puntaje: number | null
  aprobado: boolean | null
  nivelResultante: string | null
  iniciadoAt: Date
  entregadoAt: Date | null
  respuestas: { preguntaId: string; respuesta: unknown; correcta: boolean | null }[]
}

export class IntentoEvaluacion extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  static iniciar(datos: {
    usuarioId: UniqueId
    tipo: TipoEvaluacion
    bancoId: UniqueId
    matriculaId: UniqueId | null
    tomoId: string | null
    ahora: Date
  }): IntentoEvaluacion {
    return new IntentoEvaluacion({
      id: UniqueId.nuevo(),
      usuarioId: datos.usuarioId,
      tipo: datos.tipo,
      bancoId: datos.bancoId,
      matriculaId: datos.matriculaId,
      tomoId: datos.tomoId,
      estado: 'EN_CURSO',
      puntaje: null,
      aprobado: null,
      nivelResultante: null,
      iniciadoAt: datos.ahora,
      entregadoAt: null,
      respuestas: [],
    })
  }

  static reconstruir(props: Props): IntentoEvaluacion {
    return new IntentoEvaluacion(props)
  }

  /** Un intento entregado es inmutable (doc 02 §5.3). Corrige, fija el
   *  resultado y registra el evento que corresponda al tipo. */
  entregar(
    respuestas: RespuestaDada[],
    preguntas: PreguntaCorrecta[],
    umbralAprobacion: number,
    ahora: Date,
  ): Result<{ porcentaje: number; aprobado: boolean }, EnrollmentError> {
    if (this.props.estado === 'ENTREGADO')
      return Err(new IntentoYaEntregadoError(this.props.id.valor))

    const resultado = corregir(respuestas, preguntas)
    this.props.estado = 'ENTREGADO'
    this.props.entregadoAt = ahora
    this.props.puntaje = resultado.porcentaje
    this.props.respuestas = respuestas.map(r => ({
      preguntaId: r.preguntaId,
      respuesta: r.respuesta,
      correcta: resultado.correctas.get(r.preguntaId) ?? false,
    }))

    if (this.props.tipo === 'NIVELACION') {
      const nivel = nivelResultante(preguntas, resultado.correctas)
      this.props.nivelResultante = nivel
      this.props.aprobado = true // el test de nivelación no se aprueba ni reprueba
      this.record(
        new TestNivelacionCompletadoEvent(
          this.props.id.valor,
          this.props.usuarioId.valor,
          nivel,
          resultado.porcentaje,
        ),
      )
      return Ok({ porcentaje: resultado.porcentaje, aprobado: true })
    }

    const aprobado = resultado.porcentaje >= umbralAprobacion
    this.props.aprobado = aprobado
    if (this.props.tipo === 'TOMO' && this.props.tomoId) {
      if (aprobado) {
        this.record(
          new EvaluacionAprobadaEvent(
            this.props.id.valor,
            this.props.usuarioId.valor,
            this.props.tomoId,
            resultado.porcentaje,
            resultado.porcentaje === 100,
          ),
        )
      } else {
        this.record(
          new EvaluacionReprobadaEvent(
            this.props.id.valor,
            this.props.usuarioId.valor,
            this.props.tomoId,
            resultado.porcentaje,
          ),
        )
      }
    }
    return Ok({ porcentaje: resultado.porcentaje, aprobado })
  }

  get id(): UniqueId {
    return this.props.id
  }
  get usuarioId(): UniqueId {
    return this.props.usuarioId
  }
  get tipo(): TipoEvaluacion {
    return this.props.tipo
  }
  get bancoId(): UniqueId {
    return this.props.bancoId
  }
  get matriculaId(): UniqueId | null {
    return this.props.matriculaId
  }
  get tomoId(): string | null {
    return this.props.tomoId
  }
  get estado(): EstadoIntento {
    return this.props.estado
  }
  get puntaje(): number | null {
    return this.props.puntaje
  }
  get aprobado(): boolean | null {
    return this.props.aprobado
  }
  get nivel(): string | null {
    return this.props.nivelResultante
  }
  get iniciadoAt(): Date {
    return this.props.iniciadoAt
  }
  get entregadoAt(): Date | null {
    return this.props.entregadoAt
  }
  get respuestas(): readonly Props['respuestas'][number][] {
    return this.props.respuestas
  }
}
