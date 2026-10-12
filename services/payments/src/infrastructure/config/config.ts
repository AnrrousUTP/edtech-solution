// Único lugar del servicio donde se lee process.env (doc 12 §3).
export type Config = {
  puerto: number
  region: string
  awsEndpoint: string | undefined
  busName: string
  colaUrl: string | undefined
  referralVerificationSecretName?: string
  referralVerificationParameterName?: string
  dynamoTable: string | undefined
  urlBase: string
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
    referralVerificationSecretName: env.REFERRAL_VERIFICATION_SECRET_NAME,
    referralVerificationParameterName: env.REFERRAL_VERIFICATION_PARAMETER_NAME,
    dynamoTable: env.DYNAMODB_TABLE,
    urlBase: env.URL_BASE ?? 'http://localhost:3000',
    cognito: {
      issuer: env.COGNITO_ISSUER ?? 'http://jwt-local:4599',
      clientId: env.COGNITO_CLIENT_ID,
      jwksUri: env.COGNITO_JWKS_URI,
    },
    db: { url: env.DATABASE_URL, secretName: env.DB_SECRET_NAME },
  }
}
