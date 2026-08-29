import { AggregateRoot, Err, Ok, type Result, UniqueId } from '@edtech/shared-kernel'
import { NivelActualizadoEvent } from '../events/nivel-actualizado.event'
import { PerfilActualizadoEvent } from '../events/perfil-actualizado.event'
import { UsuarioRegistradoEvent } from '../events/usuario-registrado.event'
import { PerfilInvalidoError } from '../module.errors'
import type { Email } from '../value-objects/email.vo'
import { Nivel } from '../value-objects/nivel.vo'

export type RolDominio = 'ESTUDIANTE' | 'ADMIN'
export type OrigenNivel = 'TEST' | 'AUTODECLARADO' | 'PROGRESION'

export type CambiosPerfil = {
  nombreVisible?: string
  avatarUrl?: string | null
  pais?: string | null
  idioma?: string
}

type Props = {
  id: UniqueId // = sub de Cognito, inmutable (doc 02 §5.1)
  email: Email
  nombreVisible: string
  avatarUrl: string | null
  pais: string | null
  idioma: string
  rol: RolDominio
  nivel: Nivel
  origenNivel: OrigenNivel
}

export class Usuario extends AggregateRoot {
  private constructor(private readonly props: Props) {
    super()
  }

  /** Alta desde Cognito: rol ESTUDIANTE, nivel A, origen AUTODECLARADO (doc 08 §4). */
  static crearDesdeCognito(id: UniqueId, email: Email, nombreVisible: string): Usuario {
    const nivelA = Nivel.crear('A')
    if (!nivelA.ok) throw nivelA.error // imposible: 'A' es válido por construcción
    const u = new Usuario({
      id,
      email,
      nombreVisible,
      avatarUrl: null,
      pais: null,
      idioma: 'es',
      rol: 'ESTUDIANTE',
      nivel: nivelA.value,
      origenNivel: 'AUTODECLARADO',
    })
    u.record(new UsuarioRegistradoEvent(id.valor, email.valor, nombreVisible, 'ESTUDIANTE'))
    return u
  }

  /** Rehidratación desde persistencia: sin eventos. */
  static reconstruir(props: Props): Usuario {
    return new Usuario(props)
  }

  actualizarPerfil(cambios: CambiosPerfil): Result<void, PerfilInvalidoError> {
    const campos: string[] = []
    if (cambios.nombreVisible !== undefined) {
      const nombre = cambios.nombreVisible.trim()
      if (nombre.length < 2 || nombre.length > 80)
        return Err(new PerfilInvalidoError('nombreVisible debe tener entre 2 y 80 caracteres'))
      this.props.nombreVisible = nombre
      campos.push('nombreVisible')
    }
    if (cambios.avatarUrl !== undefined) {
      this.props.avatarUrl = cambios.avatarUrl
      campos.push('avatarUrl')
    }
    if (cambios.pais !== undefined) {
      if (cambios.pais !== null && !/^[A-Z]{2}$/.test(cambios.pais))
        return Err(new PerfilInvalidoError('pais debe ser un código ISO de 2 letras'))
      this.props.pais = cambios.pais
      campos.push('pais')
    }
    if (cambios.idioma !== undefined) {
      if (!/^[a-z]{2}$/.test(cambios.idioma))
        return Err(new PerfilInvalidoError('idioma debe ser un código de 2 letras'))
      this.props.idioma = cambios.idioma
      campos.push('idioma')
    }
    if (campos.length > 0) this.record(new PerfilActualizadoEvent(this.props.id.valor, campos))
    return Ok(undefined)
  }

  /** Regla de no-castigo (doc 02 §2): nivel = max(actual, nivelMax del curso). */
  subirNivelPorCurso(nivelMaxCurso: Nivel): void {
    this.#subirNivel(nivelMaxCurso, 'PROGRESION')
  }

  /** El test fija el nivel con origen TEST; tampoco baja (no-castigo). */
  fijarNivelPorTest(nivelResultante: Nivel): void {
    this.#subirNivel(nivelResultante, 'TEST')
  }

  #subirNivel(candidato: Nivel, origen: OrigenNivel): void {
    const nuevo = this.props.nivel.maximo(candidato)
    if (nuevo.equals(this.props.nivel) && this.props.origenNivel === origen) return
    const anterior = this.props.nivel
    this.props.nivel = nuevo
    this.props.origenNivel = origen
    if (!nuevo.equals(anterior)) {
      this.record(
        new NivelActualizadoEvent(this.props.id.valor, anterior.valor, nuevo.valor, origen),
      )
    }
  }

  get id(): UniqueId {
    return this.props.id
  }
  get email(): Email {
    return this.props.email
  }
  get nombreVisible(): string {
    return this.props.nombreVisible
  }
  get avatarUrl(): string | null {
    return this.props.avatarUrl
  }
  get pais(): string | null {
    return this.props.pais
  }
  get idioma(): string {
    return this.props.idioma
  }
  get rol(): RolDominio {
    return this.props.rol
  }
  get nivel(): Nivel {
    return this.props.nivel
  }
  get origenNivel(): OrigenNivel {
    return this.props.origenNivel
  }
}
