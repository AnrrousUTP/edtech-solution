import Link from 'next/link'
import { catalogApi } from '@/api/catalog'
import { ErrorConAccion, Etiqueta, precioTexto } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'
import { AccionesCurso } from './acciones-curso'

// Pantalla 12: panel de admin. La autorización REAL la hace el servidor
// (requiereRol('admin') en cada servicio): ocultar el enlace no es autorización.
const PanelAdmin = async (): Promise<JSX.Element> => {
  if (!(await esAdmin())) {
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="Esta sección es para gestionar el catálogo. Si crees que deberías tener acceso, pídeselo a quien administra la plataforma."
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

  const cursos = await catalogApi.cursosAdmin().catch(() => [])

  return (
    <div className="tech-admin-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold text-slate-900">Administración</h1>
        <nav className="flex flex-wrap gap-3">
          <Link href="/admin/cursos/nuevo" className="boton-primario text-xs">
            Nuevo curso
          </Link>
          <Link href="/admin/carreras" className="boton-secundario text-xs">
            Rutas
          </Link>
          <Link href="/admin/bancos" className="boton-secundario text-xs">
            Evaluaciones
          </Link>
          <Link href="/admin/certificados" className="boton-secundario text-xs">
            Credenciales
          </Link>
          <Link href="/admin/matriculas" className="boton-secundario text-xs">
            Accesos
          </Link>
          <Link href="/admin/flashcards" className="boton-secundario text-xs">
            Revisión de flashcards
          </Link>
          <Link href="/admin/metricas" className="boton-secundario text-xs">
            Métricas
          </Link>
        </nav>
      </div>

      <h2 className="mt-8 text-xl font-extrabold text-slate-900">Cursos</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="pb-3 pr-4 font-bold">Curso</th>
              <th className="pb-3 pr-4 font-bold">Tecnología</th>
              <th className="pb-3 pr-4 font-bold">Niveles</th>
              <th className="pb-3 pr-4 font-bold">Precio</th>
              <th className="pb-3 pr-4 font-bold">Estado</th>
              <th className="pb-3 font-bold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cursos.map(curso => (
              <tr key={curso.id}>
                <td className="py-4 pr-4">
                  <Link
                    href={`/admin/cursos/${curso.id}`}
                    className="font-bold text-slate-900 transition-colors hover:text-marca-600"
                  >
                    {curso.titulo}
                  </Link>
                  <p className="font-mono text-xs text-slate-400">{curso.slug}</p>
                  <Link
                    href={`/cursos/${curso.slug}`}
                    className="mt-1 inline-block text-xs text-marca-600"
                  >
                    Vista pública ↗
                  </Link>
                </td>
                <td className="py-4 pr-4 text-slate-600">{curso.tecnologia}</td>
                <td className="py-4 pr-4 text-slate-600">
                  {curso.nivelMin}–{curso.nivelMax}
                </td>
                <td className="py-4 pr-4 font-bold text-slate-700">
                  {precioTexto(curso.precio, curso.moneda)}
                </td>
                <td className="py-4 pr-4">
                  <Etiqueta
                    tono={
                      curso.estado === 'PUBLICADO'
                        ? 'exito'
                        : curso.estado === 'BORRADOR'
                          ? 'neutro'
                          : 'alerta'
                    }
                  >
                    {curso.estado}
                  </Etiqueta>
                </td>
                <td className="py-4">
                  <AccionesCurso
                    cursoId={curso.id}
                    estado={curso.estado}
                    precio={curso.precio}
                    moneda={curso.moneda}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cursos.length === 0 && (
        <p className="mt-6 text-sm text-slate-600">
          No hay cursos todavía. Créalos con la API de admin o con el seed (
          <code className="font-mono">bun run db:seed</code>).
        </p>
      )}
    </div>
  )
}

export default PanelAdmin
