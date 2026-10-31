import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ErrorConAccion } from '@/componentes/base'
import { esDocente, mfaPendiente } from '@/lib/sesion'
import { GestorBancos } from './gestor'

export default async function BancosAdmin({
  searchParams,
}: {
  searchParams: Promise<{ curso?: string; tomo?: string; uso?: string }>
}): Promise<JSX.Element> {
  if (!(await esDocente()))
    return (
      <ErrorConAccion
        titulo="Necesitas el rol docente"
        detalle="Entra para gestionar evaluaciones."
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
  const [bancos, cursos] = await Promise.all([
    catalogApi.bancosAdmin().catch(() => []),
    catalogApi.cursosAdmin().catch(() => []),
  ])
  const filtros = await searchParams
  const detalles = await Promise.all(
    cursos.map(curso => catalogApi.cursoAdmin(curso.id).catch(() => null)),
  )
  const tomos = detalles.flatMap(curso =>
    curso
      ? curso.tomos.map(tomo => ({
          id: tomo.id,
          titulo: tomo.titulo,
          cursoId: curso.id,
          cursoTitulo: curso.titulo,
        }))
      : [],
  )
  const cursosDisponibles = cursos.map(curso => ({ id: curso.id, titulo: curso.titulo }))
  return (
    <div className="tech-admin-page">
      <Link href="/admin" className="admin-backlink">
        <svg className="inline-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Área docente
      </Link>
      <h1 className="admin-title">Evaluaciones</h1>
      <p className="admin-lead">
        Genera preguntas desde los materiales y revisa las respuestas antes de guardarlas.
      </p>
      <GestorBancos
        bancos={bancos}
        tomos={tomos}
        cursos={cursosDisponibles}
        seleccionInicial={{
          cursoId: filtros.curso ?? '',
          tomoId: filtros.tomo ?? '',
          uso: filtros.uso,
        }}
      />
    </div>
  )
}
