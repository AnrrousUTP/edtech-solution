import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { Err, Ok, type Result } from '@edtech/shared-kernel'
import { BancoNoDisponibleError } from '../../domain/module.errors'
import type {
  BancoConRespuestas,
  BancoRespuestasPort,
} from '../../domain/ports-out/banco-respuestas.port'
import type { CarreraPublicada, CarrerasPort } from '../../domain/ports-out/carreras.port'

type GatewayResponse<T> = { data?: T; error?: { message?: string } }

/** Lecturas privadas al catálogo mediante invocación IAM directa entre Lambdas.
 * No se expone solucionEsperada/respuestaCorrecta en rutas HTTP públicas.
 */
export class CatalogLambdaGateway implements BancoRespuestasPort, CarrerasPort {
  constructor(
    private readonly client: LambdaClient,
    private readonly functionName: string,
  ) {
    if (!functionName.trim()) throw new Error('Falta el nombre de la Lambda privada del catálogo')
  }

  private async invoke<T>(task: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = await this.client.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'RequestResponse',
        Payload: new TextEncoder().encode(JSON.stringify({ task, ...args })),
      }),
    )
    if (result.FunctionError) throw new Error(`Catalog Lambda falló: ${result.FunctionError}`)
    if (!result.Payload) throw new Error('Catalog Lambda devolvió una respuesta vacía')
    const response = JSON.parse(new TextDecoder().decode(result.Payload)) as GatewayResponse<T>
    if (response.error)
      throw new Error(response.error.message ?? 'Catalog Lambda devolvió un error')
    if (response.data === undefined) throw new Error('Catalog Lambda no devolvió data')
    return response.data
  }

  async respuestasDe(bancoId: string): Promise<Result<BancoConRespuestas, BancoNoDisponibleError>> {
    try {
      return Ok(await this.invoke<BancoConRespuestas>('bank-answers', { bancoId }))
    } catch (error) {
      return Err(
        new BancoNoDisponibleError(error instanceof Error ? error.message : 'sin conexión'),
      )
    }
  }

  async carrerasPublicadas(): Promise<CarreraPublicada[]> {
    try {
      const response = await this.invoke<{ carreras: CarreraPublicada[] }>('published-careers')
      return Array.isArray(response.carreras) ? response.carreras : []
    } catch {
      // A-24: la progresión de curso no se bloquea si falla esta lectura auxiliar.
      return []
    }
  }
}
