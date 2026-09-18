// Semillas de dev (doc 03 §11). Idempotente: IDs fijos + ON CONFLICT DO NOTHING.
// Local:  bun run db:seed                            (postgres del compose)
// Aurora: AURORA_HOST=<endpoint> bun run db:seed     (IAM auth como svc_catalog)
// Deja los cursos en BORRADOR; publicarlos (y emitir los eventos) es un paso
// aparte: tools/seed/publicar-cursos.ts — los eventos no se pueden "sembrar".
import { Signer } from '@aws-sdk/rds-signer'
import pg from 'pg'

// R19: un `db:seed` apuntando al lugar equivocado llena producción de cursos de
// mentira. Es un comando aparte (nunca corre al arrancar el contenedor) y además
// se niega a correr fuera de dev.
if (process.env.NODE_ENV === 'production' || process.env.ENTORNO === 'prod') {
  console.error('El seed es solo para dev: NODE_ENV=production / ENTORNO=prod lo bloquea.')
  process.exit(1)
}

const det = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const sha256 = async (texto: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const crearPool = (): pg.Pool => {
  const auroraHost = process.env.AURORA_HOST
  if (auroraHost) {
    const signer = new Signer({
      hostname: auroraHost,
      port: 5432,
      username: 'svc_catalog',
      region: process.env.AWS_REGION ?? 'us-east-1',
    })
    return new pg.Pool({
      host: auroraHost,
      port: 5432,
      user: 'svc_catalog',
      database: 'edtech',
      password: () => signer.getAuthToken(),
      ssl: { rejectUnauthorized: false },
      max: 2,
    })
  }
  return new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://svc_catalog:local@localhost:5432/edtech',
    max: 2,
  })
}

type CursoSeed = {
  id: string
  slug: string
  titulo: string
  descripcion: string
  tecnologia: string
  nivelMin: string
  nivelMax: string
  precio: string
}

const CURSOS: CursoSeed[] = [
  {
    id: det(101),
    slug: 'html-esencial',
    titulo: 'HTML Esencial',
    descripcion: 'La base de toda página: estructura, etiquetas y semántica.',
    tecnologia: 'HTML',
    nivelMin: 'A',
    nivelMax: 'B',
    precio: '0.00',
  },
  {
    id: det(102),
    slug: 'css-desde-cero',
    titulo: 'CSS desde Cero',
    descripcion: 'Del selector al layout: estilos que se entienden.',
    tecnologia: 'CSS',
    nivelMin: 'C',
    nivelMax: 'E',
    precio: '19.90',
  },
  {
    id: det(103),
    slug: 'apis-con-express',
    titulo: 'APIs con Express',
    descripcion: 'HTTP, rutas, middleware y persistencia del lado servidor.',
    tecnologia: 'EXPRESS',
    nivelMin: 'I',
    nivelMax: 'J',
    precio: '29.90',
  },
]

const NIVELES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']

const main = async (): Promise<void> => {
  const pool = crearPool()
  const c = await pool.connect()
  try {
    await c.query('BEGIN')

    // Carrera
    await c.query(
      `INSERT INTO catalog.carreras (id, slug, titulo, descripcion, estado)
       VALUES ($1, 'desarrollo-web-desde-cero', 'Desarrollo Web desde Cero',
               'De la primera etiqueta a tu primera API en producción.', 'PUBLICADO')
       ON CONFLICT (id) DO NOTHING`,
      [det(1)],
    )

    let contadorTomo = 0
    for (const [iCurso, curso] of CURSOS.entries()) {
      await c.query(
        `INSERT INTO catalog.cursos (id, slug, titulo, descripcion, tecnologia, nivel_min, nivel_max, precio, moneda, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'USD','BORRADOR')
         ON CONFLICT (id) DO NOTHING`,
        [
          curso.id,
          curso.slug,
          curso.titulo,
          curso.descripcion,
          curso.tecnologia,
          curso.nivelMin,
          curso.nivelMax,
          curso.precio,
        ],
      )
      await c.query(
        `INSERT INTO catalog.carrera_cursos (carrera_id, curso_id, orden)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [det(1), curso.id, iCurso + 1],
      )

      // 2 tomos × 4 lecciones × 3 bloques
      for (let t = 1; t <= 2; t++) {
        contadorTomo++
        const tomoId = det(200 + contadorTomo)
        await c.query(
          `INSERT INTO catalog.tomos (id, curso_id, orden, titulo, descripcion, umbral_aprobacion)
           VALUES ($1,$2,$3,$4,$5,70) ON CONFLICT (id) DO NOTHING`,
          [tomoId, curso.id, t, `${curso.titulo} — Tomo ${t}`, `Tomo ${t} de ${curso.titulo}`],
        )
        const materiales = [
          [
            'PDF',
            'Guía de conceptos',
            `https://edtech.local/materiales/${curso.slug}/${t}/guia.pdf`,
          ],
          [
            'DOCUMENTO',
            'Hoja de práctica',
            `https://edtech.local/materiales/${curso.slug}/${t}/practica`,
          ],
          [
            'VIDEO',
            'Demostración paso a paso',
            `https://edtech.local/materiales/${curso.slug}/${t}/demo`,
          ],
          [
            'ENLACE',
            'Reto de la semana',
            `https://edtech.local/materiales/${curso.slug}/${t}/reto`,
          ],
        ] as const
        for (const [orden, [tipo, titulo, url]] of materiales.entries()) {
          await c.query(
            `INSERT INTO catalog.materiales (id, tomo_id, orden, titulo, descripcion, tipo, url)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
            [
              det(40000 + contadorTomo * 10 + orden + 1),
              tomoId,
              orden + 1,
              titulo,
              `Material de apoyo de la semana ${t} de ${curso.titulo}`,
              tipo,
              url,
            ],
          )
        }
        for (let l = 1; l <= 4; l++) {
          const leccionId = det(1000 + contadorTomo * 10 + l)
          const bloques = [
            {
              orden: 1,
              tipo: 'TEXTO',
              contenido: {
                markdown: `# ${curso.titulo} T${t}L${l}\n\nConcepto principal de la lección ${l}.`,
              },
            },
            {
              orden: 2,
              tipo: 'CODIGO',
              contenido: {
                lenguaje: curso.tecnologia.toLowerCase(),
                codigo: `// ejemplo ${t}.${l}`,
              },
            },
            {
              orden: 3,
              tipo: 'CALLOUT',
              contenido: { markdown: `Recuerda practicar el punto ${l} antes de seguir.` },
            },
          ]
          const hash = await sha256(JSON.stringify(bloques))
          await c.query(
            `INSERT INTO catalog.lecciones (id, tomo_id, orden, titulo, duracion_min, contenido_hash)
             VALUES ($1,$2,$3,$4,10,$5) ON CONFLICT (id) DO NOTHING`,
            [leccionId, tomoId, l, `Lección ${l} del tomo ${t}`, hash],
          )
          for (const b of bloques) {
            await c.query(
              `INSERT INTO catalog.bloques (id, leccion_id, orden, tipo, contenido)
               VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
              [
                det(10000 + contadorTomo * 100 + l * 10 + b.orden),
                leccionId,
                b.orden,
                b.tipo,
                JSON.stringify(b.contenido),
              ],
            )
          }
        }

        // Banco de evaluación del tomo: 8 preguntas
        const bancoId = det(500 + contadorTomo)
        await c.query(
          `INSERT INTO catalog.bancos_pregunta (id, uso, tomo_id, titulo)
           VALUES ($1,'EVALUACION_TOMO',$2,$3) ON CONFLICT (id) DO NOTHING`,
          [bancoId, tomoId, `Evaluación — ${curso.titulo} Tomo ${t}`],
        )
        for (let p = 1; p <= 8; p++) {
          await c.query(
            `INSERT INTO catalog.preguntas (id, banco_id, tipo, enunciado, opciones, respuesta_correcta, puntaje)
             VALUES ($1,$2,'OPCION_UNICA',$3,$4,$5,1) ON CONFLICT (id) DO NOTHING`,
            [
              det(20000 + contadorTomo * 100 + p),
              bancoId,
              `Pregunta ${p} sobre ${curso.titulo} (tomo ${t}): ¿cuál es la opción correcta?`,
              JSON.stringify([
                { id: 'a', texto: 'Opción correcta' },
                { id: 'b', texto: 'Distractor 1' },
                { id: 'c', texto: 'Distractor 2' },
              ]),
              JSON.stringify('a'),
            ],
          )
        }

        // Banco de repaso de la semana: se entrega antes de la evaluación.
        const bancoRepasoId = det(900 + contadorTomo)
        await c.query(
          `INSERT INTO catalog.bancos_pregunta (id, uso, tomo_id, titulo)
           VALUES ($1,'REFUERZO',$2,$3) ON CONFLICT (id) DO NOTHING`,
          [bancoRepasoId, tomoId, `Repasa lo aprendido — ${curso.titulo} Tomo ${t}`],
        )
        for (let p = 1; p <= 4; p++) {
          await c.query(
            `INSERT INTO catalog.preguntas (id, banco_id, tipo, enunciado, opciones, respuesta_correcta, puntaje)
             VALUES ($1,$2,'OPCION_UNICA',$3,$4,$5,1) ON CONFLICT (id) DO NOTHING`,
            [
              det(32000 + contadorTomo * 100 + p),
              bancoRepasoId,
              `Repaso ${p} sobre ${curso.titulo} (semana ${t}): ¿cuál es la opción correcta?`,
              JSON.stringify([
                { id: 'a', texto: 'Opción correcta' },
                { id: 'b', texto: 'Distractor 1' },
                { id: 'c', texto: 'Distractor 2' },
              ]),
              JSON.stringify('a'),
            ],
          )
        }
      }

      // Evaluación inicial específica del curso: el docente puede reemplazar
      // estas preguntas y definir respuestaCorrecta desde el panel de bancos.
      const bancoInicial = det(700 + iCurso)
      await c.query(
        `INSERT INTO catalog.bancos_pregunta (id, uso, tomo_id, curso_id, titulo)
         VALUES ($1,'EVALUACION_INICIAL',NULL,$2,$3) ON CONFLICT (id) DO NOTHING`,
        [bancoInicial, curso.id, `Test inicial — ${curso.titulo}`],
      )
      for (let p = 1; p <= 5; p++) {
        await c.query(
          `INSERT INTO catalog.preguntas (id, banco_id, tipo, enunciado, opciones, respuesta_correcta, puntaje)
           VALUES ($1,$2,'OPCION_UNICA',$3,$4,$5,1) ON CONFLICT (id) DO NOTHING`,
          [
            det(31000 + iCurso * 100 + p),
            bancoInicial,
            `Pregunta inicial ${p} sobre ${curso.titulo}: ¿cuál es la opción correcta?`,
            JSON.stringify([
              { id: 'a', texto: 'Opción correcta' },
              { id: 'b', texto: 'Distractor 1' },
              { id: 'c', texto: 'Distractor 2' },
            ]),
            JSON.stringify('a'),
          ],
        )
      }
    }

    // Banco de nivelación: 20 preguntas etiquetadas A-N
    const bancoNivelacion = det(600)
    await c.query(
      `INSERT INTO catalog.bancos_pregunta (id, uso, tomo_id, titulo)
       VALUES ($1,'NIVELACION',NULL,'Test de nivelación general') ON CONFLICT (id) DO NOTHING`,
      [bancoNivelacion],
    )
    for (let p = 1; p <= 20; p++) {
      const nivel = NIVELES[Math.min(Math.floor(((p - 1) * 14) / 20), 13)]
      await c.query(
        `INSERT INTO catalog.preguntas (id, banco_id, tipo, nivel, enunciado, opciones, respuesta_correcta, puntaje)
         VALUES ($1,$2,'OPCION_UNICA',$3,$4,$5,$6,1) ON CONFLICT (id) DO NOTHING`,
        [
          det(30000 + p),
          bancoNivelacion,
          nivel,
          `Pregunta de nivelación ${p} (nivel ${nivel}): ¿cuál es la opción correcta?`,
          JSON.stringify([
            { id: 'a', texto: 'Opción correcta' },
            { id: 'b', texto: 'Distractor 1' },
            { id: 'c', texto: 'Distractor 2' },
          ]),
          JSON.stringify('a'),
        ],
      )
    }

    await c.query('COMMIT')
    console.log('Seed de catalog aplicado (3 cursos en BORRADOR, bancos completos).')
    console.log('Para publicarlos (y emitir los eventos): bun run tools/seed/publicar-cursos.ts')
  } catch (err) {
    await c.query('ROLLBACK')
    throw err
  } finally {
    c.release()
    await pool.end()
  }
}

await main()
