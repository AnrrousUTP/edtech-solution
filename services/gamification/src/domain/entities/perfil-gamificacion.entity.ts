import { AggregateRoot, UniqueId } from '@edtech/shared-kernel'
import { InsigniaOtorgadaEvent } from '../events/insignia-otorgada.event'
import { RachaExtendidaEvent } from '../events/racha-extendida.event'
import { RachaRotaEvent } from '../events/racha-rota.event'

export type CriterioInsignia =
  | 'CURSO_COMPLETADO'
  | 'CARRERA_COMPLETADA'
  | 'RACHA_7'
  | 'RACHA_30'
  | 'RACHA_100'
  | 'PRIMER_CURSO'
  | 'EVALUACION_PERFECTA'
  | 'MADRUGADOR'
  | 'MARATON'

/** Los criterios sin referencia (rachas) usan el UUID nulo: la PK queda
 *  uniforme y I-7 se sostiene en la base, no en el código (doc 03 §7). */
export const SIN_REFERENCIA = '00000000-0000-0000-0000-000000000000'

export type Insignia = { criterio: CriterioInsignia; referenciaId: string; otorgadaAt: Date }

const HITOS_RACHA: Record<number, CriterioInsignia> = {
  7: 'RACHA_7',
  30: 'RACHA_30',
  100: 'RACHA_100',
}

const DIA_MS = 24 * 60 * 60 * 1000

const soloFecha = (d: Date, zonaHoraria: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria }).format(d) // YYYY-MM-DD

type Props = {
  usuarioId: UniqueId
  nombreTitular: string | null
  puntos: number
  rachaActual: number
  rachaMaxima: number
  ultimaActividad: Date | null
  zonaHoraria: string
  insignias: Map<string, Insignia> // clave: criterio|referenciaId
}

export class PerfilGamificacion extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  static crear(usuarioId: UniqueId, zonaHoraria = 'America/Lima'): PerfilGamificacion {
    return new PerfilGamificacion({
      usuarioId,
      nombreTitular: null,
      puntos: 0,
      rachaActual: 0,
      rachaMaxima: 0,
      ultimaActividad: null,
      zonaHoraria,
      insignias: new Map(),
    })
  }

  static reconstruir(props: Props): PerfilGamificacion {
    return new PerfilGamificacion(props)
  }

  fijarNombreTitular(nombre: string): void {
    const limpio = nombre.trim()
    if (limpio) this.props.nombreTitular = limpio.slice(0, 120)
  }

  /** I-7: una insignia se otorga UNA sola vez por (usuario, criterio, referencia). */
  otorgarInsignia(criterio: CriterioInsignia, referenciaId: string, ahora: Date): boolean {
    const clave = `${criterio}|${referenciaId}`
    if (this.props.insignias.has(clave)) return false
    this.props.insignias.set(clave, { criterio, referenciaId, otorgadaAt: ahora })
    this.record(
      new InsigniaOtorgadaEvent(this.props.usuarioId.valor, criterio, referenciaId, ahora),
    )
    return true
  }

  sumarPuntos(puntos: number): void {
    this.props.puntos += puntos
  }

  /** La racha se rompe si pasan más de 48 h sin actividad: ventana de gracia de
   *  un día (doc 02 §5.4). Actividad el mismo día no la extiende. */
  registrarActividad(ahora: Date): void {
    const hoy = soloFecha(ahora, this.props.zonaHoraria)
    const anterior = this.props.ultimaActividad

    if (!anterior) {
      this.props.rachaActual = 1
      this.props.rachaMaxima = Math.max(this.props.rachaMaxima, 1)
      this.props.ultimaActividad = ahora
      this.#registrarHito()
      return
    }

    const dia = soloFecha(anterior, this.props.zonaHoraria)
    if (dia === hoy) {
      this.props.ultimaActividad = ahora
      return // misma jornada: no extiende ni rompe
    }

    const diferenciaMs = ahora.getTime() - anterior.getTime()
    if (diferenciaMs > 2 * DIA_MS) {
      const perdida = this.props.rachaActual
      this.props.rachaActual = 1
      if (perdida > 0) this.record(new RachaRotaEvent(this.props.usuarioId.valor, perdida))
    } else {
      this.props.rachaActual += 1
      this.props.rachaMaxima = Math.max(this.props.rachaMaxima, this.props.rachaActual)
      this.record(new RachaExtendidaEvent(this.props.usuarioId.valor, this.props.rachaActual))
    }
    this.props.ultimaActividad = ahora
    this.#registrarHito()
  }

  #registrarHito(): void {
    const criterio = HITOS_RACHA[this.props.rachaActual]
    if (criterio && this.props.ultimaActividad) {
      this.otorgarInsignia(criterio, SIN_REFERENCIA, this.props.ultimaActividad)
    }
  }

  tieneInsignia(criterio: CriterioInsignia, referenciaId: string): boolean {
    return this.props.insignias.has(`${criterio}|${referenciaId}`)
  }

  get usuarioId(): UniqueId {
    return this.props.usuarioId
  }
  get nombreTitular(): string | null {
    return this.props.nombreTitular
  }
  get puntos(): number {
    return this.props.puntos
  }
  get rachaActual(): number {
    return this.props.rachaActual
  }
  get rachaMaxima(): number {
    return this.props.rachaMaxima
  }
  get ultimaActividad(): Date | null {
    return this.props.ultimaActividad
  }
  get zonaHoraria(): string {
    return this.props.zonaHoraria
  }
  get insignias(): readonly Insignia[] {
    return [...this.props.insignias.values()]
  }
}
