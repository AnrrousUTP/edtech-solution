import { catalogApi } from '@/api/catalog'
import { ErrorConAccion, Vacio } from '@/componentes/base'
import { Examen } from '@/componentes/examen'
import { perfilSesion } from '@/lib/sesion'

// Pantalla 4: test de nivelación. 20 preguntas, una por pantalla, resultado
// con el tramo asignado. El estudiante puede saltarlo (doc 02 §2).
const Nivelacion = async (): Promise<JSX.Element> => {
  const perfil = await perfilSesion()
  if (!perfil) {
    return (
      <ErrorConAccion
        titulo="Entra para hacer el test"
        detalle="Necesitamos tu cuenta para guardar el nivel que te toque y recomendarte cursos."
        accion={{ texto: 'Entrar', href: '/login?destino=/nivelacion' }}
      />
    )
  }

  const banco = await catalogApi.nivelacion()
  if (!banco || banco.preguntas.length === 0) {
    return (
      <Vacio
        titulo="El test de nivelación no está disponible"
        detalle="Todavía no hay un banco de preguntas publicado. Puedes empezar por el catálogo y elegir tu tramo a mano."
        accion={{ texto: 'Ver el catálogo', href: '/cursos' }}
      />
    )
  }

  return (
    <div className="tech-level-test">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <p className="text-sm text-slate-600">
          {banco.preguntas.length} preguntas de dificultad creciente. No se aprueba ni se reprueba:
          solo sirve para ubicarte. Puedes saltarlo y elegir tu tramo a mano desde el catálogo.
        </p>
      </div>
      <Examen
        titulo="Test de nivelación"
        preguntas={banco.preguntas}
        bancoId={banco.bancoId}
        tipo="NIVELACION"
        umbral={60}
        volverA="/cursos"
      />
    </div>
  )
}

export default Nivelacion
