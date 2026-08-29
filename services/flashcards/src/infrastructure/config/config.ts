// Único lugar del servicio donde se lee process.env (doc 12 §3).
export type Config = {
  puerto: number
  region: string
  awsEndpoint: string | undefined
  busName: string
  colaUrl: string | undefined
  colaGeneracionUrl: string | undefined
  /** 'fake' en local; 'bedrock' en AWS dev desde F11 (doc 10 §8). */
  generador: 'fake' | 'bedrock'
  bedrock: { agentId: string; agentAliasId: string; modeloDeclarado: string }
  cognito: { issuer: string; clientId: string | undefined; jwksUri: string | undefined }
  db: { url: string | undefined; secretName: string | undefined }
}

export const cargarConfig = (): Config => {
  const env = process.env
  return {
    puerto: Number(env.PORT ?? 3000),
    region: env.AWS_REGION ?? 'us-east-1',
    awsEndpoint: env.AWS_ENDPOINT_URL,
    busName: env.EVENT_BUS_NAME ?? 'edtech-domain-events',
    colaUrl: env.QUEUE_URL,
    colaGeneracionUrl: env.QUEUE_GENERACION_URL,
    generador: env.GENERADOR_FLASHCARDS === 'bedrock' ? 'bedrock' : 'fake',
    bedrock: {
      agentId: env.BEDROCK_AGENT_ID ?? '',
      agentAliasId: env.BEDROCK_AGENT_ALIAS_ID ?? 'TSTALIASID',
      modeloDeclarado: env.BEDROCK_MODEL_ID ?? 'desconocido',
    },
    cognito: {
      issuer: env.COGNITO_ISSUER ?? 'http://jwt-local:4599',
      clientId: env.COGNITO_CLIENT_ID,
      jwksUri: env.COGNITO_JWKS_URI,
    },
    db: { url: env.DATABASE_URL, secretName: env.DB_SECRET_NAME },
  }
}
