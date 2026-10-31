import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

type Response = { hasAccess?: unknown }

/** Consulta privada a enrollment-progress para autorizar contenido matriculado.
 * La invocación directa queda limitada por IAM al rol de Catalog Lambda.
 */
export class EnrollmentLambdaGateway {
  constructor(
    private readonly client: LambdaClient,
    private readonly functionName: string,
  ) {}

  async tieneAcceso(usuarioId: string, cursoId: string): Promise<boolean> {
    if (!this.functionName.trim()) throw new Error('Falta configurar Enrollment Lambda')
    const result = await this.client.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'RequestResponse',
        Payload: new TextEncoder().encode(
          JSON.stringify({ task: 'verify-course-access', usuarioId, cursoId }),
        ),
      }),
    )
    if (result.FunctionError) throw new Error('Enrollment Lambda no pudo validar la matrícula')
    if (!result.Payload) throw new Error('Enrollment Lambda devolvió una respuesta vacía')
    const response = JSON.parse(new TextDecoder().decode(result.Payload)) as Response
    if (typeof response.hasAccess !== 'boolean')
      throw new Error('Enrollment Lambda devolvió una respuesta de acceso inválida')
    return response.hasAccess
  }
}
