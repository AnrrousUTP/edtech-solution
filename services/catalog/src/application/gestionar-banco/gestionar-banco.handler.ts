import {
  Err,
  Ok,
  UniqueId,
  isErr,
  type Command,
  type CommandHandler,
  type Result,
} from '@edtech/shared-kernel'
import {
  BancoPreguntas,
  type TipoPregunta,
  type UsoBanco,
} from '../../domain/entities/banco-preguntas.entity'
import { BancoNoEncontradoError, type CatalogError } from '../../domain/module.errors'
import type { BancoRepository } from '../../domain/ports-out/banco.repository'

export type PreguntaEntrada = {
  tipo: TipoPregunta
  nivel?: string
  enunciado: string
  opciones: { id: string; texto: string }[]
  respuestaCorrecta: unknown
  puntaje?: number
}

export type GestionarBancoCommand = Command & {
  readonly _tag: 'GestionarBanco'
  readonly bancoId?: string
  readonly uso?: UsoBanco
  readonly tomoId?: string | null
  readonly titulo?: string
  /** Si viene, reemplaza todas las preguntas del banco. */
  readonly preguntas?: PreguntaEntrada[]
}

export type GestionarBancoResponse = { bancoId: string; cantidadPreguntas: number }

export class GestionarBancoHandler implements CommandHandler<
  GestionarBancoCommand,
  GestionarBancoResponse,
  CatalogError
> {
  readonly handles = 'GestionarBanco' as const

  constructor(private readonly bancos: BancoRepository) {}

  async execute(cmd: GestionarBancoCommand): Promise<Result<GestionarBancoResponse, CatalogError>> {
    let banco: BancoPreguntas
    if (cmd.bancoId) {
      const existente = await this.bancos.porId(UniqueId.desde(cmd.bancoId))
      if (!existente) return Err(new BancoNoEncontradoError(cmd.bancoId))
      banco = existente
    } else {
      const creado = BancoPreguntas.crear({
        uso: cmd.uso ?? 'EVALUACION_TOMO',
        tomoId: cmd.tomoId ?? null,
        titulo: cmd.titulo ?? '',
      })
      if (isErr(creado)) return Err(creado.error)
      banco = creado.value
    }

    if (cmd.preguntas) {
      for (const p of [...banco.preguntas]) banco.eliminarPregunta(p.id)
      for (const p of cmd.preguntas) {
        const r = banco.agregarPregunta({
          tipo: p.tipo,
          nivel: p.nivel ?? null,
          enunciado: p.enunciado,
          opciones: p.opciones,
          respuestaCorrecta: p.respuestaCorrecta,
          puntaje: p.puntaje ?? 1,
        })
        if (isErr(r)) return Err(r.error)
      }
    }

    await this.bancos.guardar(banco)
    return Ok({ bancoId: banco.id.valor, cantidadPreguntas: banco.preguntas.length })
  }
}
