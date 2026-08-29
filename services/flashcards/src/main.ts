import { log } from '@edtech/shared-kernel'
import { join } from 'node:path'
import { cargarConfig } from './infrastructure/config/config'
import { construirApp } from './infrastructure/flashcards.di'

const cfg = cargarConfig()
const app = await construirApp(cfg, join(import.meta.dir, '..', 'migrations'))

const servidor = app.http.listen(cfg.puerto, () => {
  log.info('flashcards escuchando', { puerto: cfg.puerto, generador: cfg.generador })
})

if (app.poller) void app.poller.iniciar()
if (app.workerGeneracion) void app.workerGeneracion.iniciar()

const apagar = async (senal: string): Promise<void> => {
  log.info('apagando', { senal })
  servidor.close()
  await app.cerrar()
  process.exit(0)
}
process.on('SIGTERM', () => void apagar('SIGTERM'))
process.on('SIGINT', () => void apagar('SIGINT'))
