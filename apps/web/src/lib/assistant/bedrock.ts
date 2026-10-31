import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { config } from '@/lib/config'
import { ASSISTANT_INSTRUCTIONS } from './prompt'

export type AssistantMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AssistantContext = {
  pathname?: string
  pageTitle?: string
  pageSummary?: string
}

export class AssistantProviderError extends Error {
  constructor(public readonly code: 'not-configured' | 'unavailable' | 'quota-exceeded') {
    super(code)
  }
}

const client = new BedrockRuntimeClient({ region: config.cognito.region })
const modelId = config.assistant.bedrockModelId

export const generateAssistantReply = async (
  messages: AssistantMessage[],
  context?: AssistantContext,
): Promise<string> => {
  if (!config.assistant.enabled) {
    throw new AssistantProviderError('not-configured')
  }
  const contextHint = [context?.pageTitle, context?.pathname].filter(Boolean).join(' · ')
  const contextSummary = context?.pageSummary?.trim()
  const system = [
    ASSISTANT_INSTRUCTIONS,
    contextHint ? `Pantalla actual: ${contextHint}` : '',
    contextSummary ? `Datos visibles de la pantalla: ${contextSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const result = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: messages.map(message => ({
          role: message.role,
          content: [{ text: message.content }],
        })),
        inferenceConfig: { maxTokens: 420, temperature: 0.2, topP: 0.8 },
      }),
    )
    const text = result.output?.message?.content
      ?.flatMap(block => ('text' in block && block.text ? [block.text] : []))
      .join('\n')
      .trim()
    if (!text) throw new Error('Bedrock devolvió una respuesta vacía')
    return text
  } catch {
    throw new AssistantProviderError('unavailable')
  }
}

export const extraerResumenPdf = async (bytes: Uint8Array, nombre: string): Promise<string> => {
  if (!config.assistant.enabled) throw new AssistantProviderError('not-configured')
  try {
    const result = await client.send(
      new ConverseCommand({
        modelId,
        system: [
          {
            text: 'Extrae del PDF únicamente conceptos, definiciones, pasos y hechos útiles para estudiar. Responde en español, en viñetas breves, sin inventar ni agregar información externa. Máximo 1200 palabras.',
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              { document: { format: 'pdf', name: nombre.slice(0, 100), source: { bytes } } },
              { text: 'Resume este material para preparar el repaso y la evaluación semanal.' },
            ],
          },
        ],
        inferenceConfig: { maxTokens: 1400, temperature: 0.1, topP: 0.8 },
      }),
    )
    const text = result.output?.message?.content
      ?.flatMap(block => ('text' in block && block.text ? [block.text] : []))
      .join('\n')
      .trim()
    if (!text) throw new Error('Bedrock devolvió un resumen vacío')
    return text
  } catch {
    throw new AssistantProviderError('unavailable')
  }
}
