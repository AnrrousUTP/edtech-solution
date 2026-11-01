import { createHmac, timingSafeEqual } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { PreguntaEvaluacionBorrador } from './bedrock'
import { config } from '@/lib/config'

export type WeeklyResourceStatus =
  'QUEUED' | 'PROCESSING' | 'READY' | 'APPROVING' | 'APPROVED' | 'FAILED'
export type WeeklyResourceJob = {
  jobId: string
  userId: string
  courseId: string
  tomoId: string
  courseTitle: string
  weekTitle: string
  level: string
  objectives: string[]
  sourcePrior: string
  sourceReview: string
  status: WeeklyResourceStatus
  createdAt: string
  expiresAt: number
  updatedAt?: string
  lastDispatchAt?: number
  processingLeaseUntil?: number
  approvalLeaseUntil?: number
  error?: string
  priorQuestions?: PreguntaEvaluacionBorrador[]
  reviewQuestions?: PreguntaEvaluacionBorrador[]
  priorBankId?: string
  reviewBankId?: string
}

const table = config.assistant.controlTable
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.cognito.region }), {
  marshallOptions: { removeUndefinedValues: true },
})
const key = (jobId: string) => ({ PK: `WEEKLY_RESOURCE#${jobId}`, SK: 'JOB' })

const assertTable = (): string => {
  if (!table) throw new Error('EDTECH_CONTROL_TABLE is not configured')
  return table
}

const secretIsStrongEnough = (secret: string): boolean => Buffer.byteLength(secret, 'utf8') >= 32

export const weeklyResourcesIntegrationConfigured = (): boolean => {
  const secret = config.assistant.weeklyJobSecret
  const webhook = config.assistant.makeWeeklyWebhookUrl
  if (!secretIsStrongEnough(secret)) return false
  try {
    const url = new URL(webhook)
    return (
      url.protocol === 'https:' &&
      /^hook\.[a-z0-9-]+\.make\.com$/i.test(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname.split('/').filter(Boolean).length > 0
    )
  } catch {
    return false
  }
}

const latestJobKey = (userId: string, courseId: string, tomoId: string) => ({
  PK: `WEEKLY_RESOURCE_USER#${userId}#COURSE#${courseId}#TOMO#${tomoId}`,
  SK: 'LATEST',
})

export const saveWeeklyResourceJob = async (job: WeeklyResourceJob): Promise<void> => {
  await dynamo.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: assertTable(),
            Item: { ...key(job.jobId), ...job },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: assertTable(),
            Item: {
              ...latestJobKey(job.userId, job.courseId, job.tomoId),
              jobId: job.jobId,
              expiresAt: job.expiresAt,
            },
          },
        },
      ],
    }),
  )
}

export const getWeeklyResourceJob = async (jobId: string): Promise<WeeklyResourceJob | null> => {
  const result = await dynamo.send(
    new GetCommand({ TableName: assertTable(), Key: key(jobId), ConsistentRead: true }),
  )
  const job = result.Item as WeeklyResourceJob | undefined
  if (!job || job.expiresAt <= Math.floor(Date.now() / 1000)) return null
  return job
}

export const getLatestWeeklyResourceJob = async (
  userId: string,
  courseId: string,
  tomoId: string,
): Promise<WeeklyResourceJob | null> => {
  const latest = await dynamo.send(
    new GetCommand({
      TableName: assertTable(),
      Key: latestJobKey(userId, courseId, tomoId),
      ConsistentRead: true,
    }),
  )
  const pointer = latest.Item as { jobId?: string; expiresAt?: number } | undefined
  if (!pointer?.jobId || !pointer.expiresAt || pointer.expiresAt <= Math.floor(Date.now() / 1000))
    return null
  const job = await getWeeklyResourceJob(pointer.jobId)
  if (
    !job ||
    job.userId !== userId ||
    job.courseId !== courseId ||
    job.tomoId !== tomoId ||
    job.expiresAt <= Math.floor(Date.now() / 1000)
  )
    return null
  return job
}

export const markWeeklyResourceProcessing = async (jobId: string): Promise<boolean> => {
  const nowEpoch = Math.floor(Date.now() / 1000)
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: assertTable(),
        Key: key(jobId),
        UpdateExpression:
          'SET #status = :processing, #processingLeaseUntil = :leaseUntil, #lastDispatchAt = :nowEpoch, updatedAt = :now',
        ConditionExpression:
          '#expiresAt > :nowEpoch AND (#status = :queued OR (#status = :processing AND (attribute_not_exists(#processingLeaseUntil) OR #processingLeaseUntil <= :nowEpoch)))',
        ExpressionAttributeNames: {
          '#expiresAt': 'expiresAt',
          '#lastDispatchAt': 'lastDispatchAt',
          '#processingLeaseUntil': 'processingLeaseUntil',
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':processing': 'PROCESSING',
          ':queued': 'QUEUED',
          ':leaseUntil': nowEpoch + 180,
          ':nowEpoch': nowEpoch,
          ':now': new Date().toISOString(),
        },
      }),
    )
    return true
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false
    throw error
  }
}

export const canRetryWeeklyResourceDelivery = (job: WeeklyResourceJob): boolean => {
  const nowEpoch = Math.floor(Date.now() / 1000)
  if (job.status === 'QUEUED') return (job.lastDispatchAt ?? 0) <= nowEpoch - 60
  if (job.status === 'PROCESSING')
    return (
      (!job.processingLeaseUntil || job.processingLeaseUntil <= nowEpoch) &&
      (job.lastDispatchAt ?? 0) <= nowEpoch - 60
    )
  return false
}

export const claimWeeklyResourceRedelivery = async (jobId: string): Promise<boolean> => {
  const nowEpoch = Math.floor(Date.now() / 1000)
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: assertTable(),
        Key: key(jobId),
        UpdateExpression: 'SET #lastDispatchAt = :nowEpoch, updatedAt = :now',
        ConditionExpression:
          '#expiresAt > :nowEpoch AND ((#status = :queued AND (attribute_not_exists(#lastDispatchAt) OR #lastDispatchAt <= :retryAfter)) OR (#status = :processing AND (attribute_not_exists(#processingLeaseUntil) OR #processingLeaseUntil <= :nowEpoch) AND (attribute_not_exists(#lastDispatchAt) OR #lastDispatchAt <= :retryAfter)))',
        ExpressionAttributeNames: {
          '#expiresAt': 'expiresAt',
          '#lastDispatchAt': 'lastDispatchAt',
          '#processingLeaseUntil': 'processingLeaseUntil',
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':queued': 'QUEUED',
          ':processing': 'PROCESSING',
          ':retryAfter': nowEpoch - 60,
          ':nowEpoch': nowEpoch,
          ':now': new Date().toISOString(),
        },
      }),
    )
    return true
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false
    throw error
  }
}

export const updateWeeklyResourceJob = async (
  jobId: string,
  changes: Partial<WeeklyResourceJob>,
  removeSources = false,
): Promise<void> => {
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = { ':now': new Date().toISOString() }
  const sets = ['updatedAt = :now']
  for (const field of [
    'status',
    'error',
    'lastDispatchAt',
    'approvalLeaseUntil',
    'priorQuestions',
    'reviewQuestions',
    'priorBankId',
    'reviewBankId',
  ] as const) {
    if (changes[field] === undefined) continue
    const alias = `#${field}`
    const value = `:${field}`
    names[alias] = field
    values[value] = changes[field]
    sets.push(`${alias} = ${value}`)
  }
  const removed = [
    ...(removeSources ? ['sourcePrior', 'sourceReview'] : []),
    ...(changes.status && changes.status !== 'PROCESSING' ? ['processingLeaseUntil'] : []),
    ...(changes.status && changes.status !== 'APPROVING' ? ['approvalLeaseUntil'] : []),
  ]
  const removeAliases = removed.map((field, index) => {
    const alias = `#remove${index}`
    names[alias] = field
    return alias
  })
  await dynamo.send(
    new UpdateCommand({
      TableName: assertTable(),
      Key: key(jobId),
      UpdateExpression: `SET ${sets.join(', ')}${removeAliases.length ? ` REMOVE ${removeAliases.join(', ')}` : ''}`,
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
      ExpressionAttributeValues: values,
    }),
  )
}

export const claimWeeklyResourceApproval = async (jobId: string): Promise<boolean> => {
  const now = Math.floor(Date.now() / 1000)
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: assertTable(),
        Key: key(jobId),
        UpdateExpression:
          'SET #status = :approving, approvalLeaseUntil = :leaseUntil, updatedAt = :now',
        ConditionExpression:
          '#expiresAt > :nowEpoch AND (#status = :ready OR (#status = :approving AND (attribute_not_exists(approvalLeaseUntil) OR approvalLeaseUntil <= :nowEpoch)))',
        ExpressionAttributeNames: { '#expiresAt': 'expiresAt', '#status': 'status' },
        ExpressionAttributeValues: {
          ':approving': 'APPROVING',
          ':ready': 'READY',
          ':nowEpoch': now,
          ':leaseUntil': now + 180,
          ':now': new Date().toISOString(),
        },
      }),
    )
    return true
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false
    throw error
  }
}

export const createWeeklyResourceToken = (jobId: string): string => {
  const secret = config.assistant.weeklyJobSecret
  if (!secretIsStrongEnough(secret)) throw new Error('EDTECH_WEEKLY_JOB_SECRET must be 32 bytes or longer')
  const issuedAt = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', secret).update(`${jobId}.${issuedAt}`).digest('hex')
  return `${issuedAt}.${signature}`
}

export const verifyWeeklyResourceToken = (jobId: string, token: string): boolean => {
  const secret = config.assistant.weeklyJobSecret
  const match = /^(\d{10})\.([a-f0-9]{64})$/i.exec(token)
  if (!secretIsStrongEnough(secret) || !match) return false
  const [, issuedAtText, signature] = match
  const issuedAt = Number(issuedAtText)
  if (
    !Number.isInteger(issuedAt) ||
    Math.abs(Date.now() / 1000 - issuedAt) > 900
  )
    return false
  const expected = createHmac('sha256', secret).update(`${jobId}.${issuedAt}`).digest('hex')
  const actualBuffer = Buffer.from(signature, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  )
}
