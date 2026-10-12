import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { Err, Ok, type Result } from '@edtech/shared-kernel'
import type {
  GeneradorFlashcardsPort,
  EntradaGeneracion,
  SalidaGeneracion,
} from '../../domain/ports-out/generador-flashcards.port'
import { GeneracionError } from '../../domain/module.errors'
import { extraerTarjetas, validarTarjetas } from '../../domain/value-objects/salida-modelo.vo'

export const crearBedrockClient = (cfg: { region: string }): BedrockRuntimeClient =>
  new BedrockRuntimeClient({ region: cfg.region })
export class BedrockGeneradorFlashcards implements GeneradorFlashcardsPort {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelo: string,
  ) {}
  async generar(input: EntradaGeneracion): Promise<Result<SalidaGeneracion, GeneracionError>> {
    if (!this.modelo) return Err(new GeneracionError('BEDROCK_MODEL_ID no configurado'))
    try {
      const r = await this.client.send(
        new ConverseCommand({
          modelId: this.modelo,
          system: [
            {
              text: 'Genera flashcards educativas en español. Responde únicamente JSON válido con la forma {"tarjetas":[{"anverso":"...","reverso":"..."}]}. No agregues markdown.',
            },
          ],
          messages: [
            {
              role: 'user',
              content: [{ text: JSON.stringify({ cantidad: input.cantidadDeseada, ...input }) }],
            },
          ],
          inferenceConfig: { maxTokens: 3000, temperature: 0.2 },
        }),
      )
      const texto =
        r.output?.message?.content
          ?.flatMap(part => ('text' in part && part.text ? [part.text] : []))
          .join('') ?? ''
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
