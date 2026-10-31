import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { flashcardsApi } from '@/api/resto'
import { EditorCurso } from '../../editor-curso'
import { ErrorConAccion } from '@/componentes/base'
import { esDocente, mfaPendiente } from '@/lib/sesion'

export default async function EditarCurso({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<JSX.Element> {
  if (!(await esDocente()))
    return (
      <ErrorConAccion
        titulo="Necesitas el rol docente"
        detalle="Entra con una cuenta docente para editar contenido."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  if (await mfaPendiente())
    return (
      <ErrorConAccion
        titulo="Configura tu segundo factor para entrar"
        detalle="El área docente exige verificación en dos pasos."
        accion={{ texto: 'Configurarlo ahora', href: '/configurar-mfa' }}
      />
    )
  const { id } = await params
  const curso = await catalogApi.cursoAdmin(id)
  if (!curso)
    return (
      <ErrorConAccion
        titulo="Curso no encontrado"
        detalle="La ficha no existe o fue retirada."
        accion={{ texto: 'Volver al panel docente', href: '/admin' }}
      />
    )
  const contenido = await Promise.all(
    curso.tomos.flatMap(tomo =>
      tomo.lecciones.map(async leccion => catalogApi.contenidoAdmin(leccion.id)),
    ),
  )
  const porId = new Map(contenido.filter(Boolean).map(leccion => [leccion!.id, leccion]))
  const estructura = curso.tomos.map(tomo => ({
    ...tomo,
    lecciones: tomo.lecciones.map(leccion => ({
      ...leccion,
      bloques: porId.get(leccion.id)?.bloques ?? [],
      ejercicios: porId.get(leccion.id)?.ejercicios ?? [],
    })),
  }))
  const mazosPorTomo = await Promise.all(
    curso.tomos.map(async tomo => ({
      tomoId: tomo.id,
      mazos: (await flashcardsApi.mazosAdmin(tomo.id)) ?? [],
    })),
  )
  return (
    <div className="tech-admin-page">
      <Link href="/admin" className="admin-backlink">
        <svg className="inline-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Área docente
      </Link>
      <EditorCurso curso={curso} contenido={estructura} mazosPorTomo={mazosPorTomo} />
    </div>
  )
}
