'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Etiqueta } from '@/componentes/base'
import type { MazoAdmin } from '@/api/resto'

export const RevisionMazo = ({ mazo }: { mazo: MazoAdmin }): JSX.Element => {
  const router = useRouter()
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState({ anverso: '', reverso: '' })
  const [motivo, setMotivo] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const llamar = async (
    tarjetaId: string,
    accion: 'aprobar' | 'rechazar',
    cuerpo: Record<string, unknown> = {},
  ): Promise<void> => {
    setOcupada(tarjetaId)
    setError(null)
    const respuesta = await fetch('/api/admin/flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mazoId: mazo.mazoId, tarjetaId, accion, ...cuerpo }),
    })
    setOcupada(null)
    if (!respuesta.ok) {
      const datos = (await respuesta.json().catch(() => ({}))) as { error?: string }
      setError(datos.error ?? 'No se pudo completar la acción')
      return
    }
    setEditando(null)
    router.refresh()
  }

  const publicadas = mazo.tarjetas.filter(t => t.estado === 'PUBLICADA').length

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-600">
        {publicadas} de {mazo.tarjetas.length} aprobadas
        {publicadas === 0 && ' — el estudiante todavía no ve ninguna'}
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-alerta-100 p-3 text-sm text-alerta-700" role="alert">
          {error}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {mazo.tarjetas.map(tarjeta => (
          <li key={tarjeta.id} className="rounded-lg border border-slate-200 p-4">
            {editando === tarjeta.id ? (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor={`anverso-${tarjeta.id}`}
                    className="text-xs font-bold uppercase text-slate-500"
                  >
                    Anverso (máx. 120)
                  </label>
                  <input
                    id={`anverso-${tarjeta.id}`}
                    value={borrador.anverso}
                    maxLength={120}
                    onChange={e => setBorrador(b => ({ ...b, anverso: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`reverso-${tarjeta.id}`}
                    className="text-xs font-bold uppercase text-slate-500"
                  >
                    Reverso (máx. 400)
                  </label>
                  <textarea
                    id={`reverso-${tarjeta.id}`}
                    value={borrador.reverso}
                    maxLength={400}
                    rows={3}
                    onChange={e => setBorrador(b => ({ ...b, reverso: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={ocupada === tarjeta.id}
                    onClick={() => void llamar(tarjeta.id, 'aprobar', borrador)}
                    className="boton-exito px-3 py-1.5 text-xs"
                  >
                    Guardar y aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="boton-secundario px-3 py-1.5 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{tarjeta.anverso}</p>
                    <p className="mt-1.5 text-sm text-slate-600">{tarjeta.reverso}</p>
                    {tarjeta.motivoRechazo && (
                      <p className="mt-2 text-xs text-alerta-700">
                        Rechazada: {tarjeta.motivoRechazo}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Etiqueta
                      tono={
                        tarjeta.estado === 'PUBLICADA'
                          ? 'exito'
                          : tarjeta.estado === 'RECHAZADA'
                            ? 'alerta'
                            : 'neutro'
                      }
                    >
                      {tarjeta.estado}
                    </Etiqueta>
                    {tarjeta.editada && <Etiqueta tono="marca">editada</Etiqueta>}
                  </div>
                </div>

                {tarjeta.estado !== 'PUBLICADA' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={ocupada === tarjeta.id}
                      onClick={() => void llamar(tarjeta.id, 'aprobar')}
                      className="boton-exito px-3 py-1.5 text-xs"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(tarjeta.id)
                        setBorrador({ anverso: tarjeta.anverso, reverso: tarjeta.reverso })
                      }}
                      className="boton-secundario px-3 py-1.5 text-xs"
                    >
                      Editar y aprobar
                    </button>
                    <input
                      value={motivo[tarjeta.id] ?? ''}
                      onChange={e => setMotivo(m => ({ ...m, [tarjeta.id]: e.target.value }))}
                      placeholder="Motivo del rechazo"
                      aria-label="Motivo del rechazo"
                      className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      disabled={ocupada === tarjeta.id || !(motivo[tarjeta.id] ?? '').trim()}
                      onClick={() =>
                        void llamar(tarjeta.id, 'rechazar', { motivo: motivo[tarjeta.id] })
                      }
                      className="boton border border-alerta-500 bg-white px-3 py-1.5 text-xs text-alerta-700 hover:bg-alerta-100"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
