import {
  crearEventBridgeClient,
  EventBridgePublisher,
  type IEventPublisher,
} from '@edtech/shared-kernel'
import type { Config } from '../config/config'

export const crearPublisher = (cfg: Config): IEventPublisher =>
  new EventBridgePublisher(
    crearEventBridgeClient({
      region: cfg.region,
      ...(cfg.awsEndpoint ? { endpoint: cfg.awsEndpoint } : {}),
    }),
    cfg.busName,
  )
