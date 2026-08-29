import {
  Ok,
  UniqueId,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Reloj,
  type Result,
} from '@edtech/shared-kernel'
import { PerfilGamificacion } from '../../domain/entities/perfil-gamificacion.entity'
import type { GamificationError } from '../../domain/module.errors'
import type { PerfilRepository } from '../../domain/ports-out/perfil.repository'

export type RegistrarActividadCommand = Command & {
  readonly _tag: 'RegistrarActividad'
  readonly usuarioId: string
  readonly puntos?: number
}

export type RegistrarActividadResponse = { rachaActual: number; puntos: number }

/** Racha y puntos por lección completada (doc 02 §5.4). */
export class RegistrarActividadHandler implements CommandHandler<
  RegistrarActividadCommand,
  RegistrarActividadResponse,
  GamificationError
> {
  readonly handles = 'RegistrarActividad' as const

  constructor(
    private readonly perfiles: PerfilRepository,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
  ) {}

  async execute(
    cmd: RegistrarActividadCommand,
  ): Promise<Result<RegistrarActividadResponse, GamificationError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    const perfil =
      (await this.perfiles.porUsuario(usuarioId)) ?? PerfilGamificacion.crear(usuarioId)

    perfil.registrarActividad(this.reloj.ahora())
    perfil.sumarPuntos(cmd.puntos ?? 10)

    await this.perfiles.guardar(perfil)
    await this.publisher.publish(perfil.pullEvents())
    return Ok({ rachaActual: perfil.rachaActual, puntos: perfil.puntos })
  }
}

export type CrearPerfilCommand = Command & {
  readonly _tag: 'CrearPerfil'
  readonly usuarioId: string
}

/** identity.usuario-registrado.v1 → crea el perfil de gamificación. Idempotente. */
export class CrearPerfilHandler implements CommandHandler<
  CrearPerfilCommand,
  { creado: boolean },
  GamificationError
> {
  readonly handles = 'CrearPerfil' as const

  constructor(private readonly perfiles: PerfilRepository) {}

  async execute(cmd: CrearPerfilCommand): Promise<Result<{ creado: boolean }, GamificationError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    if (await this.perfiles.porUsuario(usuarioId)) return Ok({ creado: false })
    await this.perfiles.guardar(PerfilGamificacion.crear(usuarioId))
    return Ok({ creado: true })
  }
}

export type OtorgarEvaluacionPerfectaCommand = Command & {
  readonly _tag: 'OtorgarEvaluacionPerfecta'
  readonly usuarioId: string
  readonly tomoId: string
}

export class OtorgarEvaluacionPerfectaHandler implements CommandHandler<
  OtorgarEvaluacionPerfectaCommand,
  { otorgada: boolean },
  GamificationError
> {
  readonly handles = 'OtorgarEvaluacionPerfecta' as const

  constructor(
    private readonly perfiles: PerfilRepository,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
  ) {}

  async execute(
    cmd: OtorgarEvaluacionPerfectaCommand,
  ): Promise<Result<{ otorgada: boolean }, GamificationError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    const perfil =
      (await this.perfiles.porUsuario(usuarioId)) ?? PerfilGamificacion.crear(usuarioId)
    const otorgada = perfil.otorgarInsignia('EVALUACION_PERFECTA', cmd.tomoId, this.reloj.ahora())
    if (otorgada) perfil.sumarPuntos(50)
    await this.perfiles.guardar(perfil)
    await this.publisher.publish(perfil.pullEvents())
    return Ok({ otorgada })
  }
}
