import { assistantConfig } from './config'
import { ASSISTANT_INSTRUCTIONS } from './prompt'

export type AssistantMessage = {
  role: 'user' | 'assistant'
  content: string
}

export class AssistantProviderError extends Error {
  constructor(public readonly code: 'not-configured' | 'unavailable') {
    super(code)
  }
}

type OpenAIResponse = {
  status?: string
  incomplete_details?: { reason?: string } | null
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

export const generateAssistantReply = async (messages: AssistantMessage[]): Promise<string> => {
  if (!assistantConfig.openAiApiKey) {
    throw new AssistantProviderError('not-configured')
  }

  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${assistantConfig.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: assistantConfig.openAiModel,
        instructions: ASSISTANT_INSTRUCTIONS,
        input: messages.map(message => ({
          role: message.role,
          content: [
            {
              type: message.role === 'assistant' ? 'output_text' : 'input_text',
              text: message.content,
            },
          ],
        })),
        // gpt-5-mini razona antes de contestar: con el esfuerzo por defecto
        // gastaba todo el presupuesto en razonamiento y no devolvía texto.
        reasoning: { effort: 'minimal' },
        text: { verbosity: 'low' },
        max_output_tokens: 800,
        store: false,
      }),
    })
  } catch {
    throw new AssistantProviderError('unavailable')
  }

  if (!response.ok) {
    throw new AssistantProviderError('unavailable')
  }

  let data: OpenAIResponse
  try {
    data = (await response.json()) as OpenAIResponse
  } catch {
    throw new AssistantProviderError('unavailable')
  }

  const text = data.output
    ?.flatMap(item => item.content ?? [])
    .find(item => item.type === 'output_text' && typeof item.text === 'string')
    ?.text?.trim()

  if (!text) {
    throw new AssistantProviderError('unavailable')
  }

  return text
}
