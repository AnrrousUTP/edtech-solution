import { describe, expect, test } from 'bun:test'
import { CommandBus, type Command, type CommandHandler } from './bus'
import { Ok, type Result } from './result.type'

type Saludar = Command & { readonly _tag: 'Saludar'; nombre: string }

class SaludarHandler implements CommandHandler<Saludar, string, never> {
  readonly handles = 'Saludar' as const
  async execute(cmd: Saludar): Promise<Result<string, never>> {
    return Ok(`hola ${cmd.nombre}`)
  }
}

describe('CommandBus', () => {
  test('despacha al handler registrado por _tag', async () => {
    const bus = new CommandBus()
    bus.register(new SaludarHandler())
    const r = await bus.dispatch<string, never>({ _tag: 'Saludar', nombre: 'mundo' } as Saludar)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('hola mundo')
  })

  test('lanza si no hay handler (error de arranque, no de negocio)', () => {
    const bus = new CommandBus()
    expect(() => bus.dispatch({ _tag: 'NoExiste' })).toThrow('Sin handler para NoExiste')
  })
})
