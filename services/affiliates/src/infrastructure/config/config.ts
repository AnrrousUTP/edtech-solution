export const cargarConfig = () => {
  const env = process.env
  return {
    puerto: Number(env.PORT ?? 3000),
    dbUrl: env.DATABASE_URL,
    dbHost: env.DB_HOST,
    dbUser: env.DB_USER ?? 'svc_affiliates',
    region: env.AWS_REGION ?? 'us-east-1',
    awsEndpoint: env.AWS_ENDPOINT_URL,
    bus: env.EVENT_BUS_NAME ?? 'edtech-domain-events',
    cola: env.QUEUE_URL,
    dynamoTable: env.DYNAMODB_TABLE,
    referralSigningParameter: env.REFERRAL_SIGNING_PARAMETER_NAME,
    secretoFirma: env.REFERRAL_SIGNING_SECRET_NAME ?? 'edtech/dev/referral-signing',
    issuer: env.COGNITO_ISSUER ?? 'http://jwt-local:4599',
    clientId: env.COGNITO_CLIENT_ID,
    jwksUri: env.COGNITO_JWKS_URI,
  }
}
export type Config = ReturnType<typeof cargarConfig>
