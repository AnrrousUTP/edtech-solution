import {
  Ok,
  UniqueId,
  type Command,
  type CommandHandler,
  type IEventPublisher,
  type Reloj,
  type Result,
} from '@edtech/shared-kernel'
import { Certificado } from '../../domain/entities/certificado.entity'
import { PerfilGamificacion } from '../../domain/entities/perfil-gamificacion.entity'
import type { GamificationError } from '../../domain/module.errors'
import type { CertificadoRepository } from '../../domain/ports-out/certificado.repository'
import type { PerfilRepository } from '../../domain/ports-out/perfil.repository'
import type { ColaCertificados } from '../../domain/ports-out/pdf.port'
import { CodigoVerificacion } from '../../domain/value-objects/codigo-verificacion.vo'

export type OtorgarPorCursoCommand = Command & {
  readonly _tag: 'OtorgarPorCurso'
  readonly usuarioId: string
  readonly cursoId: string
  readonly cursoTitulo: string
}

export type OtorgarPorCursoResponse = {
  insigniaOtorgada: boolean
  certificadoId: string | null
  certificadoNuevo: boolean
}

const PUNTOS_CURSO = 100

/** I-7: reprocesar curso-completado NO otorga una segunda insignia ni emite un
 *  segundo certificado. La unicidad vive en la entidad y en la PK de la tabla. */
export class OtorgarPorCursoHandler implements CommandHandler<
  OtorgarPorCursoCommand,
  OtorgarPorCursoResponse,
  GamificationError
> {
  readonly handles = 'OtorgarPorCurso' as const

  constructor(
    private readonly perfiles: PerfilRepository,
    private readonly certificados: CertificadoRepository,
    private readonly cola: ColaCertificados,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
    private readonly aleatorio: () => number,
  ) {}

  async execute(
    cmd: OtorgarPorCursoCommand,
  ): Promise<Result<OtorgarPorCursoResponse, GamificationError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    const ahora = this.reloj.ahora()

    const perfil =
      (await this.perfiles.porUsuario(usuarioId)) ?? PerfilGamificacion.crear(usuarioId)

    const esPrimero = perfil.insignias.every(i => i.criterio !== 'CURSO_COMPLETADO')
    const insigniaOtorgada = perfil.otorgarInsignia('CURSO_COMPLETADO', cmd.cursoId, ahora)
    if (insigniaOtorgada) {
      perfil.sumarPuntos(PUNTOS_CURSO)
      if (esPrimero) perfil.otorgarInsignia('PRIMER_CURSO', cmd.cursoId, ahora)
    }
    await this.perfiles.guardar(perfil)
    await this.publisher.publish(perfil.pullEvents())

    // Certificado menor por curso, único por (usuario, tipo, referencia)
    const existente = await this.certificados.porReferencia(usuarioId, 'MENOR', cmd.cursoId)
    if (existente) {
      return Ok({ insigniaOtorgada, certificadoId: existente.id.valor, certificadoNuevo: false })
    }

    const certificado = Certificado.emitir({
      usuarioId,
      tipo: 'MENOR',
      referenciaId: cmd.cursoId,
      titulo: cmd.cursoTitulo,
      nombreTitular: cmd.usuarioId, // el nombre real llega del perfil de identity (A-27)
      codigo: CodigoVerificacion.generar(this.aleatorio),
      ahora,
    })
    await this.certificados.guardar(certificado)
    await this.publisher.publish(certificado.pullEvents())
    await this.cola.encolar(certificado.id.valor)

    return Ok({ insigniaOtorgada, certificadoId: certificado.id.valor, certificadoNuevo: true })
  }
}

export type OtorgarPorCarreraCommand = Command & {
  readonly _tag: 'OtorgarPorCarrera'
  readonly usuarioId: string
  readonly carreraId: string
  readonly carreraTitulo: string
}

/** Certificado MAYOR al completar la carrera (doc 02 §1). */
export class OtorgarPorCarreraHandler implements CommandHandler<
  OtorgarPorCarreraCommand,
  OtorgarPorCursoResponse,
  GamificationError
> {
  readonly handles = 'OtorgarPorCarrera' as const

  constructor(
    private readonly perfiles: PerfilRepository,
    private readonly certificados: CertificadoRepository,
    private readonly cola: ColaCertificados,
    private readonly publisher: IEventPublisher,
    private readonly reloj: Reloj,
    private readonly aleatorio: () => number,
  ) {}

  async execute(
    cmd: OtorgarPorCarreraCommand,
  ): Promise<Result<OtorgarPorCursoResponse, GamificationError>> {
    const usuarioId = UniqueId.desde(cmd.usuarioId)
    const ahora = this.reloj.ahora()

    const perfil =
      (await this.perfiles.porUsuario(usuarioId)) ?? PerfilGamificacion.crear(usuarioId)
    const insigniaOtorgada = perfil.otorgarInsignia('CARRERA_COMPLETADA', cmd.carreraId, ahora)
    if (insigniaOtorgada) perfil.sumarPuntos(PUNTOS_CURSO * 3)
    await this.perfiles.guardar(perfil)
    await this.publisher.publish(perfil.pullEvents())

    const existente = await this.certificados.porReferencia(usuarioId, 'MAYOR', cmd.carreraId)
    if (existente) {
      return Ok({ insigniaOtorgada, certificadoId: existente.id.valor, certificadoNuevo: false })
    }

    const certificado = Certificado.emitir({
      usuarioId,
      tipo: 'MAYOR',
      referenciaId: cmd.carreraId,
      titulo: cmd.carreraTitulo,
      nombreTitular: cmd.usuarioId,
      codigo: CodigoVerificacion.generar(this.aleatorio),
      ahora,
    })
    await this.certificados.guardar(certificado)
    await this.publisher.publish(certificado.pullEvents())
    await this.cola.encolar(certificado.id.valor)

    return Ok({ insigniaOtorgada, certificadoId: certificado.id.valor, certificadoNuevo: true })
  }
}
