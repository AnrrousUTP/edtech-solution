'use client'

import { useState } from 'react'

export const OtorgarCredencial = (): JSX.Element => {
  const [tipo, setTipo] = useState<'curso' | 'carrera'>('curso')
  const [form, setForm] = useState({
    usuarioId: '',
    cursoId: '',
    cursoTitulo: '',
    carreraId: '',
    carreraTitulo: '',
  })
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const guardar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setOcupado(true)
    setMensaje(null)
    const respuesta = await fetch('/api/admin/certificados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, datos: form }),
    })
    const data = await respuesta.json()
    setOcupado(false)
    setMensaje(
      respuesta.ok
        ? data.certificadoNuevo
          ? `Credencial emitida: ${data.certificadoId}`
          : 'La credencial ya existía para esta referencia.'
        : (data.error ?? 'No se pudo emitir'),
    )
  }
  return (
    <form className="tech-admin-card mt-8 max-w-3xl" onSubmit={guardar}>
      <div className="admin-section-kicker">CREDENTIALS / MANUAL AWARD</div>
      <h2>Otorgar certificado o insignia</h2>
      <p className="admin-help">
        Usa esta acción para correcciones manuales o reconocimientos extraordinarios. El servicio
        conserva la unicidad por usuario y referencia.
      </p>
      <div className="admin-form-grid">
        <label className="admin-form-wide">
          ID del usuario
          <input
            required
            value={form.usuarioId}
            onChange={e => setForm({ ...form, usuarioId: e.target.value })}
            placeholder="UUID de Cognito"
          />
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={e => setTipo(e.target.value as 'curso' | 'carrera')}>
            <option value="curso">Curso</option>
            <option value="carrera">Carrera</option>
          </select>
        </label>
        {tipo === 'curso' ? (
          <>
            <label>
              ID del curso
              <input
                required
                value={form.cursoId}
                onChange={e => setForm({ ...form, cursoId: e.target.value })}
              />
            </label>
            <label className="admin-form-wide">
              Título del curso
              <input
                required
                value={form.cursoTitulo}
                onChange={e => setForm({ ...form, cursoTitulo: e.target.value })}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              ID de la carrera
              <input
                required
                value={form.carreraId}
                onChange={e => setForm({ ...form, carreraId: e.target.value })}
              />
            </label>
            <label className="admin-form-wide">
              Título de la carrera
              <input
                required
                value={form.carreraTitulo}
                onChange={e => setForm({ ...form, carreraTitulo: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      {mensaje && (
        <p className="admin-form-success" role="status">
          {mensaje}
        </p>
      )}
      <button disabled={ocupado} type="submit" className="boton-primario mt-5">
        {ocupado ? 'Procesando…' : 'Emitir credencial'}
      </button>
    </form>
  )
}
