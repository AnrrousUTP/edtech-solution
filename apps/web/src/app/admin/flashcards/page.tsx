import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { flashcardsApi } from '@/api/resto'
import { ErrorConAccion, Etiqueta, Vacio } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { RevisionMazo } from './revision'

// Pantalla 13: cola de revisión HITL. Ninguna tarjeta llega al estudiante sin
// pasar por acá (doc 10 §6).
type Props = { searchParams: Promise<{ tomo?: string }> }

const RevisionFlashcards = async ({ searchParams }: Props): Promise<JSX.Element> => {
  if (!(await esAdmin())) {
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="La revisión de flashcards es la barrera que impide que material sin revisar llegue a los estudiantes."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  }

  if (await mfaPendiente()) {
    return (
      <ErrorConAccion
        titulo="Configura tu segundo factor para entrar"
        detalle="El panel de administración exige verificación en dos pasos (doc 08 §6). Toma un minuto."
        accion={{ texto: 'Configurarlo ahora', href: '/configurar-mfa' }}
      />
    )
  }

  const { tomo: tomoElegido } = await searchParams
  const cursos = await catalogApi.cursosAdmin().catch(() => [])

  // Detalle de cada curso para listar sus tomos (lectura de admin, fuera del
  // camino caliente: es la excepción síncrona autorizada del doc 05 §7).
  const detalles = await Promise.all(cursos.map(c => catalogApi.cursoAdmin(c.id).catch(() => null)))
  const tomos = detalles
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .flatMap(curso =>
      curso.tomos.map(tomo => ({ id: tomo.id, titulo: tomo.titulo, curso: curso.titulo })),
    )

  const mazos = tomoElegido ? ((await flashcardsApi.mazosAdmin(tomoElegido)) ?? []) : []

  return (
    <div className="tech-admin-flashcards">
      <nav className="text-sm text-slate-500">
        <Link href="/admin" className="transition-colors hover:text-marca-600">
          Administración
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-slate-700">Flashcards</span>
      </nav>

      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Revisión de flashcards</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Las tarjetas las genera un modelo y{' '}
        <strong>no llegan al estudiante hasta que las apruebas</strong>. Puedes editar el texto
        antes de aprobar; rechazar exige un motivo, que es lo que permite mejorar el prompt con
        evidencia.
      </p>

      <div className="mt-6">
        <label htmlFor="tomo" className="text-xs font-bold uppercase text-slate-500">
          Tomo
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {tomos.map(tomo => (
            <Link
              key={tomo.id}
              href={`/admin/flashcards?tomo=${tomo.id}`}
              className={`etiqueta border transition-colors ${
                tomoElegido === tomo.id
                  ? 'border-marca-600 bg-marca-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-marca-400 hover:bg-marca-50'
              }`}
            >
              {tomo.curso} — {tomo.titulo}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {!tomoElegido ? (
          <Vacio
            titulo="Elige un tomo para revisar sus mazos"
            detalle="Cada tomo tiene un mazo por versión de contenido. El mazo en revisión es el que espera tu aprobación."
          />
        ) : mazos.length === 0 ? (
          <Vacio
            titulo="Este tomo no tiene mazos todavía"
            detalle="Los mazos se generan cuando se publica o edita el contenido del tomo. Si acabas de publicarlo, dale un minuto."
          />
        ) : (
          <div className="space-y-8">
            {mazos.map(mazo => (
              <section key={mazo.mazoId} className="tarjeta p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-900">Versión {mazo.version}</h2>
                  <Etiqueta
                    tono={
                      mazo.estado === 'PUBLICADO'
                        ? 'exito'
                        : mazo.estado === 'EN_REVISION'
                          ? 'acento'
                          : mazo.estado === 'FALLIDO'
                            ? 'alerta'
                            : 'neutro'
                    }
                  >
                    {mazo.estado}
                  </Etiqueta>
                  {mazo.modeloUsado && (
                    <span className="font-mono text-xs text-slate-500">{mazo.modeloUsado}</span>
                  )}
                </div>
                <RevisionMazo mazo={mazo} />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default RevisionFlashcards
