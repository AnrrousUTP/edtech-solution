import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'

const region = process.env.AWS_REGION ?? 'us-east-1'
const catalogTable = process.env.EDTECH_TABLE_CATALOG ?? 'edtech-lowcost-catalog'
const paymentsTable = process.env.EDTECH_TABLE_PAYMENTS ?? 'edtech-lowcost-payments'
const enrollmentTable = process.env.EDTECH_TABLE_ENROLLMENT ?? 'edtech-lowcost-enrollment-progress'
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

const additionalCourses = [
  {
    id: 45,
    titulo: 'Fundamentos de inteligencia artificial',
    tecnologia: 'Inteligencia artificial',
    descripcion: 'Conceptos esenciales de IA, modelos y usos responsables.',
  },
  {
    id: 46,
    titulo: 'Desarrollo web con JavaScript',
    tecnologia: 'Desarrollo web',
    descripcion: 'Construye interfaces web y comprende los fundamentos de JavaScript.',
  },
  {
    id: 47,
    titulo: 'Introducción a la ciberseguridad',
    tecnologia: 'Ciberseguridad',
    descripcion: 'Aprende prácticas básicas para proteger cuentas, equipos y datos.',
  },
  {
    id: 48,
    titulo: 'Datos y visualización con Python',
    tecnologia: 'Ciencia de datos',
    descripcion: 'Prepara datos y comunica hallazgos con visualizaciones claras.',
  },
  {
    id: 49,
    titulo: 'Computación en la nube con AWS',
    tecnologia: 'Computación en la nube',
    descripcion: 'Conoce los componentes esenciales para desplegar soluciones en AWS.',
  },
] as const

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
      additionalCourses: additionalCourses.map(course => ({
        id: `a0000000-0000-4000-8000-${String(course.id).padStart(12, '0')}`,
        titulo: course.titulo,
        price: 'USD 10.00',
      })),
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

// La matrícula se consulta junto con una proyección del catálogo en la tabla
// de progreso. El seed anterior omitía esta proyección, por eso el pago se
// registraba pero la ruta de aprendizaje respondía como si no hubiera acceso.
const cursosDemo = [
  {
    id: courseId,
    slug: courseSlug,
    titulo: 'Curso demo para afiliados',
    descripcion: 'Curso de demostración para validar atribución QR y comisiones.',
    tecnologia: 'Fundamentos digitales',
    lessonId,
    tomoId,
  },
  ...additionalCourses.map(course => ({
    ...course,
    id: `a0000000-0000-4000-8000-${String(course.id).padStart(12, '0')}`,
    slug: course.titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, ''),
    lessonId: `a0000000-0000-4000-8000-${String(course.id + 10).padStart(12, '0')}`,
    tomoId: `a0000000-0000-4000-8000-${String(course.id + 20).padStart(12, '0')}`,
  })),
]

for (const [index, demo] of cursosDemo.entries()) {
  if (index > 0) {
    const publishedAt = new Date(Date.now() + index).toISOString()
    const sortKey = `COURSES#PUBLICADO#${publishedAt}#${demo.id}`
    const item = {
      PK: `COURSE#${demo.id}`,
      SK: 'PROFILE',
      entity: 'Course',
      id: demo.id,
      slug: demo.slug,
      titulo: demo.titulo,
      descripcion: demo.descripcion,
      tecnologia: demo.tecnologia,
      nivelMin: 'A',
      nivelMax: 'C',
      precio: 10,
      moneda: 'USD',
      versionPrecio: 1,
      imagenUrl: null,
      estado: 'PUBLICADO',
      publicadoAt: publishedAt,
      tomos: [
        {
          id: demo.tomoId,
          orden: 1,
          titulo: 'Contenido de muestra',
          descripcion: 'Lección introductoria de demostración.',
          umbral: 70,
          lecciones: [
            {
              id: demo.lessonId,
              orden: 1,
              titulo: 'Primeros pasos',
              duracionMin: 8,
              contenidoHash: `demo-${demo.id}`,
            },
          ],
        },
      ],
      version: 1,
      createdAt: publishedAt,
      updatedAt: publishedAt,
      GSI1PK: 'COURSES#PUBLICADO',
      GSI1SK: sortKey,
      GSI2PK: 'COURSES#ALL',
      GSI2SK: sortKey,
    }
    const items = [
      { table: catalogTable, Item: item },
      {
        table: catalogTable,
        Item: {
          PK: `COURSE_SLUG#${demo.slug}`,
          SK: 'LOOKUP',
          entity: 'CourseSlug',
          cursoId: demo.id,
        },
      },
      {
        table: paymentsTable,
        Item: {
          PK: `COURSE#${demo.id}`,
          SK: 'PRICE',
          entity: 'CoursePrice',
          cursoId: demo.id,
          titulo: demo.titulo,
          montoCentavos: 1000,
          moneda: 'USD',
          versionPrecio: 1,
          publicado: true,
          updatedAt: publishedAt,
        },
      },
    ]
    for (const row of items) {
      await client.send(
        new PutCommand({
          TableName: row.table,
          Item: row.Item,
          ConditionExpression: 'attribute_not_exists(PK) OR cursoId = :courseId OR id = :courseId',
          ExpressionAttributeValues: { ':courseId': demo.id },
        }),
      )
    }
  }

  const profileKey = { PK: `COURSE#${demo.id}`, SK: 'PROJECTION' }
  const projection = {
    ...profileKey,
    entity: 'CourseProjection',
    cursoId: demo.id,
    titulo: demo.titulo,
    slug: demo.slug,
    publicado: true,
    precio: index === 0 ? 40 : 10,
    nivelMax: 'C',
    estructura: [
      {
        tomoId: demo.tomoId,
        orden: 1,
        titulo: 'Contenido de muestra',
        umbral: 70,
        lecciones: [{ id: demo.lessonId, orden: 1 }],
      },
    ],
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
  await client.send(
    new PutCommand({
      TableName: enrollmentTable,
      Item: projection,
      ConditionExpression: 'attribute_not_exists(PK) OR cursoId = :courseId',
      ExpressionAttributeValues: { ':courseId': demo.id },
    }),
  )

  const blocks =
    index === 0
      ? [
          {
            orden: 1,
            tipo: 'CALLOUT',
            contenido: {
              markdown:
                'Esta lección de muestra confirma que tu acceso está activo. Ya puedes comenzar tu aprendizaje.',
            },
          },
        ]
      : [
          {
            orden: 1,
            tipo: 'CALLOUT',
            contenido: {
              markdown: `Bienvenido a ${demo.titulo}. Esta lección gratuita de muestra confirma tu acceso al curso.`,
            },
          },
          {
            orden: 2,
            tipo: 'TEXTO',
            contenido: {
              markdown: `## De qué trata\n\n${demo.descripcion}\n\nAl terminar, habrás recorrido una primera lección de muestra.`,
            },
          },
        ]
  for (const block of blocks) {
    await client.send(
      new PutCommand({
        TableName: catalogTable,
        Item: {
          PK: `LESSON#${demo.lessonId}`,
          SK: `BLOCK#${String(block.orden).padStart(5, '0')}`,
          entity: 'LessonBlock',
          ...block,
        },
      }),
    )
  }
}

console.log(
  `Seed idempotente aplicado: curso afiliados más ${additionalCourses.length} cursos de muestra y proyecciones de aprendizaje.`,
)
