import { describe, expect, it } from 'bun:test'
import { crearUrlMqttFirmada } from './presigned-url'

describe('URL MQTT WSS firmada para AWS IoT', () => {
  it('firma el endpoint y añade el token STS después de la firma SigV4', async () => {
    const url = await crearUrlMqttFirmada({
      endpoint: 'https://example-ats.iot.us-east-1.amazonaws.com/',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'ASIAEXAMPLE',
        secretAccessKey: 'not-a-real-secret',
        sessionToken: 'temporary-token-for-test',
      },
      now: new Date('2026-10-11T12:00:00.000Z'),
    })
    const parsed = new URL(url)
    expect(parsed.protocol).toBe('wss:')
    expect(parsed.hostname).toBe('example-ats.iot.us-east-1.amazonaws.com')
    expect(parsed.pathname).toBe('/mqtt')
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(parsed.searchParams.get('X-Amz-Credential')).toContain(
      '/us-east-1/iotdevicegateway/aws4_request',
    )
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
    expect(parsed.searchParams.get('X-Amz-Security-Token')).toBe('temporary-token-for-test')
    expect(
      parsed.search.slice(parsed.search.lastIndexOf('&') + 1).startsWith('X-Amz-Security-Token='),
    ).toBe(true)
  })

  it('rechaza hosts que no son endpoints y pueden alterar la URL', async () => {
    await expect(
      crearUrlMqttFirmada({
        endpoint: 'https://iot.example.com/path?redirect=evil',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'ASIAEXAMPLE',
          secretAccessKey: 'not-a-real-secret',
          sessionToken: 'temporary-token-for-test',
        },
      }),
    ).rejects.toThrow('Endpoint IoT inválido')
  })
})
