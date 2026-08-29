// Publica los 3 cursos del seed vía la API de admin (emite los eventos reales).
// Local:  bun run tools/seed/publicar-cursos.ts               (usa jwt-local)
// AWS:    BASE_URL=<alb> ADMIN_TOKEN=<access token> bun run tools/seed/publicar-cursos.ts
const det = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CURSOS = [det(101), det(102), det(103)]

const base = process.env.BASE_URL ?? 'http://localhost:3002'
let token = process.env.ADMIN_TOKEN

if (!token) {
  const r = await fetch('http://localhost:4599/token', {
    method: 'POST',
    body: JSON.stringify({ groups: ['admin'] }),
  })
  token = ((await r.json()) as { access_token: string }).access_token
}

for (const cursoId of CURSOS) {
  const r = await fetch(`${base}/api/catalog/admin/cursos/${cursoId}/publicar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await r.text()
  console.log(`${cursoId} -> ${r.status} ${body.slice(0, 120)}`)
}
