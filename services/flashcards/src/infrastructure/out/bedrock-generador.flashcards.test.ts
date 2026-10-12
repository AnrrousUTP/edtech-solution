import { describe, expect, it } from 'bun:test'
import { ConverseCommand, type BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { BedrockGeneradorFlashcards } from './bedrock-generador.flashcards'

describe('BedrockGeneradorFlashcards', () => {
  it('usa Converse con Nova y valida las tarjetas devueltas', async () => {
    let captured: ConverseCommand['input'] | undefined
    const tarjetas = Array.from({ length: 8 }, (_, index) => ({
      anverso: `Pregunta ${index + 1}`,
      reverso: `Respuesta ${index + 1}`,
    }))
    const client = {
      send: async (command: ConverseCommand) => {
        captured = command.input
        return {
          output: { message: { content: [{ text: JSON.stringify({ tarjetas }) }] } },
        } as never
      },
    } as unknown as BedrockRuntimeClient

    const result = await new BedrockGeneradorFlashcards(client, 'amazon.nova-micro-v1:0').generar({
      tomoTitulo: 'Fundamentos',
      cursoTecnologia: 'programación',
      nivel: 'A',
      lecciones: [{ titulo: 'Variables', contenido: 'Contenido de la lección' }],
      cantidadDeseada: 8,
    })

    expect(result.ok).toBe(true)
    expect(captured?.modelId).toBe('amazon.nova-micro-v1:0')
    expect(captured?.messages?.[0]?.role).toBe('user')
  })
})
