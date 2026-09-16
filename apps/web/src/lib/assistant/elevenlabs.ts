import { assistantConfig, MAX_ASSISTANT_AUDIO_BYTES } from './config'

import { AssistantProviderError } from './openai'

type ElevenLabsResponse = {
  text?: unknown
}

export const transcribeAssistantAudio = async (audio: File): Promise<string> => {
  if (!assistantConfig.elevenLabsApiKey) {
    throw new AssistantProviderError('not-configured')
  }

  if (!audio.size || audio.size > MAX_ASSISTANT_AUDIO_BYTES) {
    throw new AssistantProviderError('unavailable')
  }

  const form = new FormData()
  form.append('file', audio, audio.name || 'edtech-message.webm')
  form.append('model_id', assistantConfig.elevenLabsSttModel)

  let response: Response
  try {
    response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': assistantConfig.elevenLabsApiKey,
      },
      body: form,
    })
  } catch {
    throw new AssistantProviderError('unavailable')
  }

  if (!response.ok) {
    throw new AssistantProviderError('unavailable')
  }

  let data: ElevenLabsResponse
  try {
    data = (await response.json()) as ElevenLabsResponse
  } catch {
    throw new AssistantProviderError('unavailable')
  }

  if (typeof data.text !== 'string' || !data.text.trim()) {
    throw new AssistantProviderError('unavailable')
  }

  return data.text.trim()
}
