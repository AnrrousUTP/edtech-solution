import { log } from '@edtech/shared-kernel'
import { join } from 'node:path'
import { cargarConfig } from './infrastructure/config/config'
import { construirApp } from './infrastructure/payments.di'

const cfg = cargarConfig()
const app = await construirApp(cfg, join(import.meta.dir, '..', 'migrations'))

const servidor = app.http.listen(cfg.puerto, () => {
  log.info('payments escuchando', { puerto: cfg.puerto })
})

if (app.poller) void app.poller.iniciar()
if (app.workerWebhooks) void app.workerWebhooks.iniciar()

// Job de expiración de órdenes PENDIENTE (doc 09 §8)
const expiracion = setInterval(() => void app.expirarOrdenes(), 15 * 60 * 1000)

const apagar = async (senal: string): Promise<void> => {
  log.info('apagando', { senal })
  clearInterval(expiracion)
  servidor.close()
  await app.cerrar()
  process.exit(0)
}
process.on('SIGTERM', () => void apagar('SIGTERM'))
process.on('SIGINT', () => void apagar('SIGINT'))
