'use client'

import { useState } from 'react'

export const OtorgarMatricula = ({
  cursos,
}: {
  cursos: { id: string; titulo: string }[]
}): JSX.Element => {
  const [usuarioId, setUsuarioId] = useState('')
  const [cursoId, setCursoId] = useState(cursos[0]?.id ?? '')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const enviar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setOcupado(true)
    setMensaje(null)
    const r = await fetch('/api/admin/matriculas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId, cursoId }),
    })
    const data = await r.json()
    setOcupado(false)
    setMensaje(
      r.ok ? `Matrícula creada: ${data.matriculaId}` : (data.error ?? 'No se pudo matricular'),
    )
  }
  return (
    <form className="tech-admin-card mt-8 max-w-3xl" onSubmit={enviar}>
      <div className="admin-section-kicker">ACCESS / MANUAL ENROLLMENT</div>
      <h2>Dar acceso a un curso</h2>
      <p className="admin-help">
        Alta manual para becas, soporte o cohortes internas. La autorización del servicio sigue
        exigiendo rol admin.
      </p>
      <div className="admin-form-grid">
        <label className="admin-form-wide">
          ID del usuario
          <input
            required
            value={usuarioId}
            onChange={e => setUsuarioId(e.target.value)}
            placeholder="UUID de Cognito"
          />
        </label>
        <label className="admin-form-wide">
          Curso
          <select required value={cursoId} onChange={e => setCursoId(e.target.value)}>
            {cursos.map(curso => (
              <option key={curso.id} value={curso.id}>
                {curso.titulo}
              </option>
            ))}
          </select>
        </label>
      </div>
      {mensaje && (
        <p className="admin-form-success" role="status">
          {mensaje}
        </p>
      )}
      <button disabled={ocupado || !cursos.length} className="boton-primario mt-5" type="submit">
        {ocupado ? 'Creando…' : 'Dar acceso'}
      </button>
    </form>
  )
}
