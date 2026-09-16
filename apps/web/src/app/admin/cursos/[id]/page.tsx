import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { EditorCurso } from '../../editor-curso'
import { ErrorConAccion } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'

export default async function EditarCurso({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<JSX.Element> {
  if (!(await esAdmin()))
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="Entra con una cuenta administradora para editar contenido."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  if (await mfaPendiente())
    return (
      <ErrorConAccion
        titulo="Configura tu segundo factor para entrar"
        detalle="El panel de administración exige verificación en dos pasos."
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
        accion={{ texto: 'Volver a administración', href: '/admin' }}
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
  return (
    <div className="tech-admin-page">
      <Link href="/admin" className="admin-backlink">
        <svg className="inline-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Administración
      </Link>
      <EditorCurso curso={curso} contenido={estructura} />
    </div>
  )
}
