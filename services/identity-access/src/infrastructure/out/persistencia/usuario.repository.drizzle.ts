import { UniqueId } from '@edtech/shared-kernel'
import { Usuario } from '../../../domain/entities/usuario.entity'
import { Email } from '../../../domain/value-objects/email.vo'
import { Nivel } from '../../../domain/value-objects/nivel.vo'
import type { UsuarioRepository } from '../../../domain/ports-out/usuario.repository'
import type { Db } from './db'

// eslint-disable-next-line -- la fila SQL es dinámica en el límite de persistencia
const reconstruir = (fila: Record<string, any>): Usuario => {
  const email = Email.crear(String(fila.email))
  const nivel = Nivel.crear(String(fila.nivel))
  if (!email.ok || !nivel.ok) throw new Error('Fila de usuario inválida')
  return Usuario.reconstruir({
    id: UniqueId.desde(String(fila.id)),
    email: email.value,
    nivel: nivel.value,
    nombreVisible: String(fila.nombre_visible),
    avatarUrl: fila.avatar_url ?? null,
    pais: fila.pais ? String(fila.pais).trim() : null,
    idioma: String(fila.idioma),
    rol: String(fila.rol),
    origenNivel: String(fila.origen_nivel),
  } as never)
}

export class DrizzleUsuarioRepository implements UsuarioRepository {
  constructor(private readonly db: Db) {}
  async porId(id: UniqueId): Promise<Usuario | null> {
    const r = await this.db.query('SELECT * FROM identity.usuarios WHERE id = $1', [id.valor])
    return r.rows[0] ? reconstruir(r.rows[0]) : null
  }
  async todos(): Promise<Usuario[]> {
    const r = await this.db.query('SELECT * FROM identity.usuarios ORDER BY created_at DESC')
    return r.rows.map(reconstruir)
  }
  async guardar(usuario: Usuario): Promise<void> {
    await this.db.query(
      `INSERT INTO identity.usuarios
      (id, email, nombre_visible, avatar_url, pais, idioma, rol, nivel, origen_nivel)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_visible = EXCLUDED.nombre_visible,
      avatar_url = EXCLUDED.avatar_url, pais = EXCLUDED.pais, idioma = EXCLUDED.idioma,
      rol = EXCLUDED.rol, nivel = EXCLUDED.nivel, origen_nivel = EXCLUDED.origen_nivel, updated_at = now()`,
      [
        usuario.id.valor,
        usuario.email.valor,
        usuario.nombreVisible,
        usuario.avatarUrl,
        usuario.pais,
        usuario.idioma,
        usuario.rol,
        usuario.nivel.valor,
        usuario.origenNivel,
      ],
    )
  }
}
