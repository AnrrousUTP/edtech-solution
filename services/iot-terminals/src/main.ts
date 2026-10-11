import { log } from '@edtech/shared-kernel'
import { join } from 'node:path'
import { cargarConfig } from './infrastructure/config/config'
import { construirApp } from './infrastructure/iot-terminals.di'
const cfg = cargarConfig()
const app = await construirApp(cfg, join(import.meta.dir, '../migrations/0000_init.sql'))
const server = app.http.listen(cfg.puerto, () =>
  log.info('iot-terminals escuchando', { puerto: cfg.puerto }),
)
app.pollers.forEach(p => void p.iniciar())
const timer = setInterval(() => void app.gateway.flush(), 3000)
const apagar = async () => {
  clearInterval(timer)
  server.close()
  await app.cerrar()
  process.exit(0)
}
process.on('SIGTERM', () => void apagar())
process.on('SIGINT', () => void apagar())
