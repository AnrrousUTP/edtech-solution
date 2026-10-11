import { createServer } from 'node:http'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const directory = new URL('../../output/proyecto-aws/', import.meta.url)
const statePath = new URL('estado.json', directory)
const action = process.argv[2] ?? 'serve'
const validStates = new Set(['todo', 'doing', 'review', 'done', 'waiting'])

if (action === 'update') {
  const [, , , taskId, status, note] = process.argv
  if (!taskId || !validStates.has(status) || !note) {
    throw new Error('Uso: node tools/local/project-board.mjs update <tarea> <estado> <nota>')
  }
  const state = JSON.parse(await readFile(statePath, 'utf8'))
  const task = state.tasks.find(item => item.id === taskId)
  if (!task) throw new Error('Tarea desconocida')
  task.status = status
  task.detail = note
  state.revision += 1
  state.updatedAt = new Date().toISOString()
  state.activity.unshift({ at: state.updatedAt, title: task.title, note })
  state.activity = state.activity.slice(0, 20)
  const temporary = new URL('estado.tmp.json', directory)
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8')
  await rename(temporary, statePath)
  console.log(`Actualizado: ${taskId} (${status})`)
} else if (action === 'serve') {
  const routes = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/estado.json', ['estado.json', 'application/json; charset=utf-8']],
  ])
  createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const route = routes.get(path)
    if (request.method !== 'GET' || !route) {
      response.writeHead(404).end('No encontrado')
      return
    }
    try {
      const body = await readFile(new URL(route[0], directory))
      response.writeHead(200, {
        'Content-Type': route[1],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      }).end(body)
    } catch {
      response.writeHead(503).end('Estado temporalmente no disponible')
    }
  }).listen(3111, '127.0.0.1', () => console.log('Tablero: http://localhost:3111'))
} else {
  throw new Error('Acción desconocida')
}
