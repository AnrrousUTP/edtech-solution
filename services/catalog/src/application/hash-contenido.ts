// sha256 hex con la WebCrypto global (sin imports: apto para application/).
export const hashContenido = async (contenido: string): Promise<string> => {
  const bytes = new TextEncoder().encode(contenido)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
