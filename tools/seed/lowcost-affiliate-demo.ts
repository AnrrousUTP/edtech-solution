import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'

const region = process.env.AWS_REGION ?? 'us-east-1'
const catalogTable = process.env.EDTECH_TABLE_CATALOG ?? 'edtech-lowcost-catalog'
const paymentsTable = process.env.EDTECH_TABLE_PAYMENTS ?? 'edtech-lowcost-payments'
const mode = process.argv[2] ?? 'plan'

if (!['plan', 'apply'].includes(mode)) {
  console.error('Uso: bun run tools/seed/lowcost-affiliate-demo.ts [plan|apply]')
  process.exit(2)
}

if (mode === 'apply' && process.env.AWS_PROFILE !== 'edtech') {
  throw new Error('Para escribir datos debes seleccionar AWS_PROFILE=edtech explícitamente.')
}

const courseId = 'a0000000-0000-4000-8000-000000000040'
const courseSlug = 'curso-demo-afiliados'
const lessonId = 'a0000000-0000-4000-8000-000000000041'
const tomoId = 'a0000000-0000-4000-8000-000000000042'
const now = new Date().toISOString()
const courseKey = `COURSES#PUBLICADO#${now}#${courseId}`

const course = {
  PK: `COURSE#${courseId}`,
  SK: 'PROFILE',
  entity: 'Course',
  id: courseId,
  slug: courseSlug,
  titulo: 'Curso demo para afiliados',
  descripcion: 'Curso de demostración para validar atribución QR y comisiones.',
  tecnologia: 'Fundamentos digitales',
  nivelMin: 'A',
  nivelMax: 'C',
  precio: 40,
  moneda: 'USD',
  versionPrecio: 1,
  imagenUrl: null,
  estado: 'PUBLICADO',
  publicadoAt: now,
  tomos: [
    {
      id: tomoId,
      orden: 1,
      titulo: 'Contenido de muestra',
      descripcion: 'Material de demostración.',
      umbral: 70,
      lecciones: [
        {
          id: lessonId,
          orden: 1,
          titulo: 'Introducción',
          duracionMin: 10,
          contenidoHash: 'demo-affiliate-course-v1',
        },
      ],
    },
  ],
  version: 1,
  createdAt: now,
  updatedAt: now,
  GSI1PK: 'COURSES#PUBLICADO',
  GSI1SK: courseKey,
  GSI2PK: 'COURSES#ALL',
  GSI2SK: courseKey,
}

const catalogSlug = {
  PK: `COURSE_SLUG#${courseSlug}`,
  SK: 'LOOKUP',
  entity: 'CourseSlug',
  cursoId: courseId,
}

const price = {
  PK: `COURSE#${courseId}`,
  SK: 'PRICE',
  entity: 'CoursePrice',
  cursoId: courseId,
  titulo: 'Curso demo para afiliados',
  montoCentavos: 4_000,
  moneda: 'USD',
  versionPrecio: 1,
  publicado: true,
  updatedAt: now,
}

console.log(
  JSON.stringify(
    {
      mode,
      region,
      tables: { catalog: catalogTable, payments: paymentsTable },
      course: { id: courseId, slug: courseSlug, price: 'USD 40.00' },
      expectedCommission: 'USD 2.00',
    },
    null,
    2,
  ),
)

if (mode === 'plan') process.exit(0)

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
})

await client.send(
  new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: catalogTable,
          Item: course,
          ConditionExpression: 'attribute_not_exists(PK) OR (entity = :entity AND id = :id)',
          ExpressionAttributeValues: { ':entity': 'Course', ':id': courseId },
        },
      },
      {
        Put: {
          TableName: catalogTable,
          Item: catalogSlug,
          ConditionExpression: 'attribute_not_exists(PK) OR cursoId = :courseId',
          ExpressionAttributeValues: { ':courseId': courseId },
        },
      },
      {
        Put: {
          TableName: paymentsTable,
          Item: price,
          ConditionExpression: 'attribute_not_exists(PK) OR cursoId = :courseId',
          ExpressionAttributeValues: { ':courseId': courseId },
        },
      },
    ],
  }),
)

console.log('Seed idempotente aplicado. El curso demo y su precio están listos para checkout.')
