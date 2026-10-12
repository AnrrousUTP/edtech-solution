import { config } from '@/lib/config'
import { accessToken, claimsDeToken } from '@/lib/sesion'

export type AssistantSession = { token: string; userId: string }

export const assistantSession = async (): Promise<AssistantSession | null> => {
  const token = await accessToken()
  if (!token) return null
  try {
    const response = await fetch(`${config.apiBase}/api/identity/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!response.ok) return null
    const subject = claimsDeToken(token)?.sub
    return typeof subject === 'string' && subject ? { token, userId: subject } : null
  } catch {
    return null
  }
}
