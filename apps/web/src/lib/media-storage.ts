import { S3Client } from '@aws-sdk/client-s3'
import { config } from '@/lib/config'

export const createMediaS3Client = (): S3Client =>
  new S3Client({
    region: config.cognito.region,
    ...(config.assistant.mediaEndpoint
      ? {
          endpoint: config.assistant.mediaEndpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.assistant.mediaAccessKeyId,
            secretAccessKey: config.assistant.mediaSecretAccessKey,
          },
        }
      : {}),
  })
