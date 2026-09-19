import Link from 'next/link'
import {
  Activity,
  Award,
  Flame,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { gamificationApi, identityApi, type PerfilGamificacion } from '@/api/resto'
import { ErrorConAccion, NivelBadge, Vacio } from '@/componentes/base'
import { esAdmin, mfaPendiente } from '@/lib/sesion'

const NOMBRES_INSIGNIAS: Record<string, string> = {
  PRIMER_CURSO: 'Primer despegue',
  CURSO_COMPLETADO: 'Ruta completada',
  CARRERA_COMPLETADA: 'Maestría de ruta',
  EVALUACION_PERFECTA: 'Mente precisa',
  RACHA_7: 'Ritmo de 7',
  RACHA_30: 'Ritmo de 30',
  RACHA_100: 'Ritmo legendario',
  MADRUGADOR: 'Primer turno',
  MARATON: 'Maratón de estudio',
}

const InsigniaIcono = ({ criterio }: { criterio: string }): JSX.Element => {
  const Icono = criterio.startsWith('RACHA')
    ? Flame
    : criterio === 'EVALUACION_PERFECTA'
      ? Star
      : Award
  return <Icono aria-hidden="true" />
}

const iniciales = (nombre: string): string =>
  nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(parte => parte[0]?.toUpperCase() ?? '')
    .join('') || 'US'

const nombreInsignia = (criterio: string): string => NOMBRES_INSIGNIAS[criterio] ?? criterio

const nombreEstudiante = (nombre: string, indice: number): string =>
  /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(nombre) ? `Estudiante ${indice + 1}` : nombre

type AdminIconoTipo = 'usuarios' | 'actividad' | 'puntos' | 'insignias' | 'racha' | 'maxima'

const ICONOS_ADMIN: Record<AdminIconoTipo, LucideIcon> = {
  usuarios: Users,
  actividad: Activity,
  puntos: Star,
  insignias: ShieldCheck,
  racha: Flame,
  maxima: TrendingUp,
}

const AdminIcono = ({ tipo }: { tipo: AdminIconoTipo }): JSX.Element => {
  const Icono = ICONOS_ADMIN[tipo]
  return <Icono className="admin-student-icon" aria-hidden="true" />
}

const AvatarPerfil = ({
  nombre,
  avatarUrl,
}: {
  nombre: string
  avatarUrl: string | null
}): JSX.Element => (
  <span className={`admin-student-avatar${avatarUrl ? ' admin-student-avatar--image' : ''}`}>
    {avatarUrl ? (
      <img src={avatarUrl} alt={`Foto de perfil de ${nombre}`} loading="lazy" />
    ) : (
      iniciales(nombre)
    )}
  </span>
)

const AdminUsuarios = async (): Promise<JSX.Element> => {
  if (!(await esAdmin())) {
    return (
      <ErrorConAccion
        titulo="Necesitas permisos de administrador"
        detalle="La lectura del progreso de estudiantes es solo para administradores."
        accion={{ texto: 'Iniciar sesión', href: '/admin/login' }}
      />
    )
  }

  if (await mfaPendiente()) {
    return (
      <ErrorConAccion
        titulo="Configura tu segundo factor para entrar"
        detalle="El panel de administración exige verificación en dos pasos."
        accion={{ texto: 'Configurarlo ahora', href: '/configurar-mfa' }}
      />
    )
  }

  const [usuarios, perfiles] = await Promise.all([
    identityApi.usuariosAdmin().catch(() => []),
    gamificationApi.perfilesAdmin().catch(() => []),
  ])
  const perfilPorUsuario = new Map(perfiles.map(perfil => [perfil.usuarioId, perfil]))
  const filas = usuarios.map(usuario => ({
    usuario,
    perfil: perfilPorUsuario.get(usuario.id) ?? {
      usuarioId: usuario.id,
      nombreTitular: usuario.nombreVisible,
      puntos: 0,
      rachaActual: 0,
      rachaMaxima: 0,
      ultimaActividad: null,
      insignias: [],
    },
  }))
  const puntosTotales = filas.reduce((total, fila) => total + fila.perfil.puntos, 0)
  const insigniasTotales = filas.reduce((total, fila) => total + fila.perfil.insignias.length, 0)
  const estudiantesActivos = filas.filter(fila => fila.perfil.ultimaActividad !== null).length

  return (
    <div className="tech-admin-page admin-students-page">
      <Link href="/admin" className="admin-backlink">
        <svg className="inline-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Administración
      </Link>

      <div className="admin-students-heading">
        <div>
          <h1 className="admin-title">Progreso de estudiantes</h1>
          <p className="admin-lead">
            Observa puntos, rachas, nivel e insignias para entender cómo avanza cada persona en sus
            recorridos.
          </p>
        </div>
        <div className="admin-students-summary">
          <span className="admin-students-summary__icon">
            <AdminIcono tipo="usuarios" />
          </span>
          <strong>{filas.length}</strong>
          <span>perfiles registrados</span>
        </div>
      </div>

      <div className="admin-student-metrics" aria-label="Resumen de usuarios">
        <div>
          <span className="admin-student-metric__label">
            <AdminIcono tipo="actividad" />
            <span>Activos</span>
          </span>
          <strong>{estudiantesActivos}</strong>
          <small>con actividad registrada</small>
        </div>
        <div>
          <span className="admin-student-metric__label">
            <AdminIcono tipo="puntos" />
            <span>Puntos acumulados</span>
          </span>
          <strong>{puntosTotales}</strong>
          <small>en todos los perfiles</small>
        </div>
        <div>
          <span className="admin-student-metric__label">
            <AdminIcono tipo="insignias" />
            <span>Insignias otorgadas</span>
          </span>
          <strong>{insigniasTotales}</strong>
          <small>logros desbloqueados</small>
        </div>
      </div>

      {filas.length === 0 ? (
        <Vacio
          titulo="Todavía no hay perfiles para mostrar"
          detalle="Cuando una persona se registre y entre a la plataforma, sus señales de progreso aparecerán aquí."
        />
      ) : (
        <div className="admin-student-grid">
          {filas.map(({ usuario, perfil }, indice) => {
            const nombre = nombreEstudiante(usuario.nombreVisible, indice)

            return (
              <article key={usuario.id} className="admin-student-card">
                <header className="admin-student-card__header">
                  <AvatarPerfil nombre={nombre} avatarUrl={usuario.avatarUrl} />
                  <div className="min-w-0">
                    <h2>{nombre}</h2>
                    <p>{usuario.email}</p>
                  </div>
                  <NivelBadge nivel={usuario.nivel} />
                </header>

                <div className="admin-student-card__stats">
                  <div>
                    <span className="admin-student-stat__label">
                      <AdminIcono tipo="puntos" />
                      <span>Puntos</span>
                    </span>
                    <strong>{perfil.puntos}</strong>
                  </div>
                  <div>
                    <span className="admin-student-stat__label">
                      <AdminIcono tipo="racha" />
                      <span>Racha actual</span>
                    </span>
                    <strong>{perfil.rachaActual} días</strong>
                  </div>
                  <div>
                    <span className="admin-student-stat__label">
                      <AdminIcono tipo="maxima" />
                      <span>Máxima</span>
                    </span>
                    <strong>{perfil.rachaMaxima} días</strong>
                  </div>
                </div>

                <div className="admin-student-card__badges">
                  <div className="admin-student-card__section-title">
                    <span className="admin-student-stat__label">
                      <AdminIcono tipo="insignias" />
                      <span>Insignias</span>
                    </span>
                    <strong>{perfil.insignias.length}</strong>
                  </div>
                  {perfil.insignias.length === 0 ? (
                    <p className="admin-student-card__empty">Aún no desbloquea insignias.</p>
                  ) : (
                    <ul>
                      {perfil.insignias.map(insignia => (
                        <li key={`${insignia.criterio}-${insignia.referenciaId}`}>
                          <span className="admin-student-badge-icon">
                            <InsigniaIcono criterio={insignia.criterio} />
                          </span>
                          <span>{nombreInsignia(insignia.criterio)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AdminUsuarios
