import {
  InvokeAgentCommand,
  BedrockAgentRuntimeClient,
} from '@aws-sdk/client-bedrock-agent-runtime'
import { Err, Ok, type Result } from '@edtech/shared-kernel'
import type {
  GeneradorFlashcardsPort,
  EntradaGeneracion,
  SalidaGeneracion,
} from '../../domain/ports-out/generador-flashcards.port'
import { GeneracionError } from '../../domain/module.errors'
import { extraerTarjetas, validarTarjetas } from '../../domain/value-objects/salida-modelo.vo'

export const crearBedrockClient = (cfg: { region: string }): BedrockAgentRuntimeClient =>
  new BedrockAgentRuntimeClient({ region: cfg.region })
export class BedrockGeneradorFlashcards implements GeneradorFlashcardsPort {
  constructor(
    private readonly client: BedrockAgentRuntimeClient,
    private readonly agentId: string,
    private readonly aliasId: string,
    private readonly modelo: string,
  ) {}
  async generar(input: EntradaGeneracion): Promise<Result<SalidaGeneracion, GeneracionError>> {
    if (!this.agentId) return Err(new GeneracionError('BEDROCK_AGENT_ID no configurado'))
    try {
      const r = await this.client.send(
        new InvokeAgentCommand({
          agentId: this.agentId,
          agentAliasId: this.aliasId,
          sessionId: crypto.randomUUID(),
          inputText: JSON.stringify({
            instruccion: 'Devuelve solo JSON con clave tarjetas',
            cantidad: input.cantidadDeseada,
            ...input,
          }),
        }),
      )
      let texto = ''
      for await (const parte of r.completion ?? []) {
        if ('chunk' in parte && parte.chunk?.bytes)
          texto += new TextDecoder().decode(parte.chunk.bytes)
      }
      const salida = extraerTarjetas(texto)
      if (!salida.ok) return Err(new GeneracionError(salida.error.message))
      const tarjetas = validarTarjetas(salida.value)
      if (!tarjetas.ok) return Err(new GeneracionError(tarjetas.error.message))
      return Ok({ tarjetas: tarjetas.value, modeloUsado: this.modelo })
    } catch (e) {
      return Err(new GeneracionError(e instanceof Error ? e.message : String(e)))
    }
  }
}
