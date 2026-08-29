// El endpoint del webhook es donde se pierde el cuerpo crudo si el orden de
// los middlewares está mal (doc 09 §3). Este test levanta Express de verdad y
// comprueba que la firma se verifica sobre el MISMO texto que llegó.
import { describe, expect, test } from 'bun:test'
import express from 'express'
import { crearRutaWebhook } from './webhook.route'
import { FakeColaWebhooks, InMemoryWebhookRepository } from '../../../application/dobles'
import type { PasarelaPagoPort } from '../../../domain/ports-out/pasarela-pago.port'

/** Pasarela que captura el cuerpo tal como le llega, para poder compararlo. */
class PasarelaEspia implements PasarelaPagoPort {
  cuerposRecibidos: string[] = []
  headersRecibidos: Record<string, string>[] = []
  responder = true

  async verificarFirmaWebhook(
    headers: Record<string, string>,
    cuerpoCrudo: string,
  ): Promise<boolean> {
    this.cuerposRecibidos.push(cuerpoCrudo)
    this.headersRecibidos.push(headers)
    return this.responder
  }
  async crearOrden(): Promise<never> {
    throw new Error('no usado')
  }
  async capturar(): Promise<never> {
    throw new Error('no usado')
  }
  async reembolsar(): Promise<never> {
    throw new Error('no usado')
  }
}

const montar = () => {
  const pasarela = new PasarelaEspia()
  const webhooks = new InMemoryWebhookRepository()
  const cola = new FakeColaWebhooks()

  const app = express()
  // ORDEN CRÍTICO: la ruta raw ANTES del json global, igual que en el .di.ts
  app.use('/api/payments', crearRutaWebhook(pasarela, webhooks, cola))
  app.use(express.json())

  const servidor = app.listen(0)
  const puerto = (servidor.address() as { port: number }).port
  return { pasarela, webhooks, cola, servidor, base: `http://localhost:${puerto}/api/payments` }
}

// Cuerpo con espaciado y orden de claves poco habituales: si algo lo
// re-serializa, el texto cambia y la firma no validaría contra PayPal.
const CUERPO_CRUDO =
  '{"id":"WH-TEST-1",\n  "event_type":"PAYMENT.CAPTURE.COMPLETED",\n"resource":{"id":"CAP-1","custom_id":"orden-1"}}'

const enviar = async (base: string, cuerpo: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'paypal-transmission-id': 'tx-1',
      'paypal-transmission-time': '2026-08-28T12:00:00Z',
      'paypal-transmission-sig': 'firma',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/cert.pem',
      'paypal-auth-algo': 'SHA256withRSA',
      ...headers,
    },
    body: cuerpo,
  })

describe('POST /api/payments/webhook', () => {
  test('la firma se verifica sobre el cuerpo CRUDO, byte por byte', async () => {
    const { pasarela, servidor, base } = montar()
    try {
      const r = await enviar(base, CUERPO_CRUDO)
      expect(r.status).toBe(200)
      // El texto que vio la verificación es idéntico al que se envió
      expect(pasarela.cuerposRecibidos[0]).toBe(CUERPO_CRUDO)
    } finally {
      servidor.close()
    }
  })

  test('los headers de firma llegan en minúsculas al verificador', async () => {
    const { pasarela, servidor, base } = montar()
    try {
      await enviar(base, CUERPO_CRUDO)
      const headers = pasarela.headersRecibidos[0]!
      expect(headers['paypal-transmission-id']).toBe('tx-1')
      expect(headers['paypal-cert-url']).toContain('paypal.com')
    } finally {
      servidor.close()
    }
  })

  test('un webhook válido se registra y se encola; responde en 200', async () => {
    const { webhooks, cola, servidor, base } = montar()
    try {
      const r = await enviar(base, CUERPO_CRUDO)
      expect(r.status).toBe(200)
      expect(webhooks.webhooks.get('WH-TEST-1')?.firmaValida).toBe(true)
      expect(cola.encolados).toEqual(['WH-TEST-1'])
    } finally {
      servidor.close()
    }
  })

  test('firma inválida: se registra con firma_valida=false, NO se encola, y responde 200', async () => {
    const { pasarela, webhooks, cola, servidor, base } = montar()
    pasarela.responder = false
    try {
      const r = await enviar(base, CUERPO_CRUDO)
      // 200 y no 400: un 400 le confirma al atacante que su sonda llegó
      expect(r.status).toBe(200)
      expect(webhooks.webhooks.get('WH-TEST-1')?.firmaValida).toBe(false)
      expect(cola.encolados).toHaveLength(0)
    } finally {
      servidor.close()
    }
  })

  test('el reintento de PayPal con el mismo event_id no se encola dos veces', async () => {
    const { cola, servidor, base } = montar()
    try {
      await enviar(base, CUERPO_CRUDO)
      await enviar(base, CUERPO_CRUDO)
      expect(cola.encolados).toEqual(['WH-TEST-1'])
    } finally {
      servidor.close()
    }
  })

  test('un cuerpo que no es JSON no rompe el endpoint', async () => {
    const { cola, servidor, base } = montar()
    try {
      const r = await enviar(base, 'esto no es json')
      expect(r.status).toBe(200)
      expect(cola.encolados).toHaveLength(0)
    } finally {
      servidor.close()
    }
  })
})

describe('Protección SSRF de paypal-cert-url (doc 09 §3)', () => {
  test('el gateway real rechaza una cert-url fuera de PayPal sin llamar a la red', async () => {
    const { PaypalGateway } = await import('../../out/paypal/paypal.gateway')
    const gateway = new PaypalGateway({
      env: 'sandbox',
      clientId: 'x',
      clientSecret: 'y',
      webhookId: 'WH-1',
      moneda: 'USD',
    })

    const valido = await gateway.verificarFirmaWebhook(
      { 'paypal-cert-url': 'https://atacante.example.com/cert.pem' },
      '{}',
    )
    expect(valido).toBe(false)
  })

  test('sin webhookId configurado, ninguna firma valida', async () => {
    const { PaypalGateway } = await import('../../out/paypal/paypal.gateway')
    const gateway = new PaypalGateway({
      env: 'sandbox',
      clientId: 'x',
      clientSecret: 'y',
      webhookId: '',
      moneda: 'USD',
    })

    const valido = await gateway.verificarFirmaWebhook(
      { 'paypal-cert-url': 'https://api.sandbox.paypal.com/cert.pem' },
      '{}',
    )
    expect(valido).toBe(false)
  })
})
