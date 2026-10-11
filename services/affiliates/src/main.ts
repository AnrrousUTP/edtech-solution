import { log } from '@edtech/shared-kernel'
import { join } from 'node:path'
import { cargarConfig } from './infrastructure/config/config'
import { construirApp } from './infrastructure/affiliates.di'
const cfg = cargarConfig()
const app = await construirApp(cfg, join(import.meta.dir, '../migrations/0000_init.sql'))
const server = app.http.listen(cfg.puerto, () =>
  log.info('affiliates escuchando', { puerto: cfg.puerto }),
)
if (app.poller) void app.poller.iniciar()
const timer = setInterval(() => void app.outbox.flush(), 1000)
const apagar = async () => {
  clearInterval(timer)
  server.close()
  await app.cerrar()
  process.exit(0)
}
process.on('SIGTERM', () => void apagar())
process.on('SIGINT', () => void apagar())
