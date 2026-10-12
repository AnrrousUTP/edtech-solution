import { randomUUID } from 'node:crypto'
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from '@aws-sdk/client-transcribe'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { parseBuffer } from 'music-metadata'
import { config } from '@/lib/config'
import { AssistantProviderError } from './bedrock'
import { reserveAssistantTranscriptionQuota } from './quota'

const region = config.cognito.region
const table = config.assistant.controlTable
const bucket = config.assistant.audioBucket
const s3 = new S3Client({ region })
const transcribe = new TranscribeClient({ region })
const ddb: DynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
})
const MAX_AUDIO_BYTES = 5 * 1024 * 1024
const JOB_TTL_SECONDS = 24 * 60 * 60

const asegurarConfiguracion = (): { table: string; bucket: string } => {
  if (!config.assistant.enabled || !table || !bucket) {
    throw new AssistantProviderError('not-configured')
  }
  return { table, bucket }
}

const audioKind = (contentType: string): 'webm' | 'mp4' => {
  if (contentType.startsWith('audio/webm')) return 'webm'
  if (contentType.startsWith('audio/mp4') || contentType.startsWith('video/mp4')) return 'mp4'
  throw new AssistantProviderError('unavailable')
}

export const crearCargaAudio = async (userId: string, contentType: string) => {
  const settings = asegurarConfiguracion()
  const format = audioKind(contentType)
  const jobId = randomUUID()
  const key = `temporary-audio/${userId}/${jobId}.${format}`
  const expiresAt = Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS
  const post = await createPresignedPost(s3, {
    Bucket: settings.bucket,
    Key: key,
    Expires: 300,
    Fields: { 'Content-Type': contentType },
    Conditions: [
      ['content-length-range', 1, MAX_AUDIO_BYTES],
      ['eq', '$Content-Type', contentType],
    ],
  })
  await ddb.send(
    new PutCommand({
      TableName: settings.table,
      Item: {
        PK: `TRANSCRIBE#${userId}`,
        SK: `JOB#${jobId}`,
        entity: 'TranscriptionJob',
        jobId,
        userId,
        objectKey: key,
        contentType,
        format,
        status: 'UPLOAD_PENDING',
        expiresAt,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    }),
  )
  return { jobId, ...post }
}

export const iniciarTranscripcion = async (userId: string, jobId: string) => {
  const settings = asegurarConfiguracion()
  const key = `TRANSCRIBE#${userId}`
  const item = await ddb.send(
    new GetCommand({
      TableName: settings.table,
      Key: { PK: key, SK: `JOB#${jobId}` },
      ConsistentRead: true,
    }),
  )
  const job = item.Item as
    | {
        objectKey?: string
        contentType?: string
        format?: 'webm' | 'mp4'
        status?: string
        transcribeJobName?: string
      }
    | undefined
  if (!job?.objectKey || !job.format) throw new AssistantProviderError('unavailable')
  if (job.status !== 'UPLOAD_PENDING') {
    if (job.status === 'PROCESSING' || job.status === 'COMPLETED') {
      return { status: job.status.toLowerCase() }
    }
    if (job.status !== 'STARTING' || !job.transcribeJobName)
      throw new AssistantProviderError('unavailable')
  }

  const transcribeJobName = `edtech-${jobId}`
  if (job.status === 'UPLOAD_PENDING') {
    const metadata = await s3.send(
      new HeadObjectCommand({ Bucket: settings.bucket, Key: job.objectKey }),
    )
    if (
      !metadata.ContentLength ||
      metadata.ContentLength > MAX_AUDIO_BYTES ||
      audioKind(metadata.ContentType ?? '') !== job.format
    ) {
      throw new AssistantProviderError('unavailable')
    }
    const object = await s3.send(
      new GetObjectCommand({ Bucket: settings.bucket, Key: job.objectKey }),
    )
    if (!object.Body) throw new AssistantProviderError('unavailable')
    const audio = await object.Body.transformToByteArray()
    if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES)
      throw new AssistantProviderError('unavailable')
    let duration: number | undefined
    try {
      const parsed = await parseBuffer(Buffer.from(audio), { mimeType: job.contentType })
      duration = parsed.format.duration
    } catch {
      throw new AssistantProviderError('unavailable')
    }
    if (!duration || !Number.isFinite(duration) || duration > 30)
      throw new AssistantProviderError('unavailable')
    const seconds = Math.max(1, Math.ceil(duration))
    try {
      await reserveAssistantTranscriptionQuota(userId, jobId, seconds)
    } catch (error) {
      if (error instanceof AssistantProviderError && error.code === 'quota-exceeded') {
        const current = await ddb.send(
          new GetCommand({
            TableName: settings.table,
            Key: { PK: key, SK: `JOB#${jobId}` },
            ConsistentRead: true,
          }),
        )
        const status = (current.Item as { status?: string } | undefined)?.status
        if (status === 'STARTING' || status === 'PROCESSING' || status === 'COMPLETED') {
          return { status: status.toLowerCase() }
        }
      }
      throw error
    }
  }
  try {
    await transcribe.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: transcribeJobName,
        LanguageCode: 'es-US',
        MediaFormat: job.format,
        Media: { MediaFileUri: `s3://${settings.bucket}/${job.objectKey}` },
        OutputBucketName: settings.bucket,
        OutputKey: `temporary-audio/results/${userId}/${jobId}.json`,
      }),
    )
  } catch (error) {
    // El nombre estable permite reintentar una petición ambigua sin volver a
    // reservar cuota. Si Transcribe ya aceptó el trabajo, ConflictException
    // confirma que el job existe.
    if ((error as { name?: string }).name !== 'ConflictException') throw error
  }
  await ddb.send(
    new UpdateCommand({
      TableName: settings.table,
      Key: { PK: key, SK: `JOB#${jobId}` },
      UpdateExpression:
        'SET #status = :processing, #transcribeJobName = :jobName, #updatedAt = :now',
      ConditionExpression: '#status = :starting',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#transcribeJobName': 'transcribeJobName',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':processing': 'PROCESSING',
        ':starting': 'STARTING',
        ':jobName': transcribeJobName,
        ':now': new Date().toISOString(),
      },
    }),
  )
  return { status: 'processing' }
}

export const consultarTranscripcion = async (userId: string, jobId: string) => {
  const settings = asegurarConfiguracion()
  const key = `TRANSCRIBE#${userId}`
  const item = await ddb.send(
    new GetCommand({
      TableName: settings.table,
      Key: { PK: key, SK: `JOB#${jobId}` },
      ConsistentRead: true,
    }),
  )
  const record = item.Item as
    { status?: string; transcript?: string; transcribeJobName?: string } | undefined
  if (!record) throw new AssistantProviderError('unavailable')
  if (record.status === 'COMPLETED' && record.transcript)
    return { status: 'completed', text: record.transcript }
  if (!record.transcribeJobName) return { status: record.status?.toLowerCase() ?? 'pending' }

  const result = await transcribe.send(
    new GetTranscriptionJobCommand({ TranscriptionJobName: record.transcribeJobName }),
  )
  const job = result.TranscriptionJob
  if (job?.TranscriptionJobStatus === 'FAILED') {
    await ddb.send(
      new UpdateCommand({
        TableName: settings.table,
        Key: { PK: key, SK: `JOB#${jobId}` },
        UpdateExpression: 'SET #status = :failed, #updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: { ':failed': 'FAILED', ':now': new Date().toISOString() },
      }),
    )
    return { status: 'failed' }
  }
  if (job?.TranscriptionJobStatus !== 'COMPLETED' || !job.Transcript?.TranscriptFileUri) {
    return { status: 'processing' }
  }

  // AWS entrega una URL firmada temporal para su JSON de transcripción.
  const response = await fetch(job.Transcript.TranscriptFileUri, { cache: 'no-store' })
  if (!response.ok) throw new AssistantProviderError('unavailable')
  const resultJson = (await response.json()) as {
    results?: { transcripts?: Array<{ transcript?: string }> }
  }
  const text = resultJson.results?.transcripts?.[0]?.transcript?.trim()
  if (!text) return { status: 'failed' }
  await ddb.send(
    new UpdateCommand({
      TableName: settings.table,
      Key: { PK: key, SK: `JOB#${jobId}` },
      UpdateExpression: 'SET #status = :completed, #transcript = :text, #updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#transcript': 'transcript',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':completed': 'COMPLETED',
        ':text': text,
        ':now': new Date().toISOString(),
      },
    }),
  )
  return { status: 'completed', text }
}
