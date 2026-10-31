import { describe, expect, test } from 'bun:test'
import type { NextFunction, Request, Response } from 'express'
import { clientIdPermitido, requiereRol, rolesAplicacionDeGrupos } from './auth.middleware'

// El client_id es la segunda barrera del doc 08 §5: aunque el token esté bien
// firmado por el pool, tiene que venir de un cliente que conocemos.
describe('clientIdPermitido', () => {
  test('sin configuración no revisa nada (emisor local)', () => {
    expect(clientIdPermitido(undefined, 'cualquiera')).toBe(true)
    expect(clientIdPermitido('', 'cualquiera')).toBe(true)
    expect(clientIdPermitido('   ', 'cualquiera')).toBe(true)
  })

  test('con un solo cliente acepta ese y rechaza el resto', () => {
    expect(clientIdPermitido('abc123', 'abc123')).toBe(true)
    expect(clientIdPermitido('abc123', 'otro')).toBe(false)
  })

  test('acepta la lista de dev: cliente web y cliente de pruebas', () => {
    const configurados = '8t4bju1rutbsa6d5s4950ocv5, sm3r98rg412itpo9pua41i4u8'
    expect(clientIdPermitido(configurados, '8t4bju1rutbsa6d5s4950ocv5')).toBe(true)
    expect(clientIdPermitido(configurados, 'sm3r98rg412itpo9pua41i4u8')).toBe(true)
    expect(clientIdPermitido(configurados, 'de-otro-pool')).toBe(false)
  })

  test('un token sin client_id no pasa cuando sí hay lista', () => {
    expect(clientIdPermitido('abc123', undefined)).toBe(false)
    expect(clientIdPermitido('abc123', null)).toBe(false)
  })
})

describe('requiereRol', () => {
  const ejecutar = (auth: Request['auth'], rol: 'estudiante' | 'docente' | 'afiliado') => {
    let status = 200
    let body: unknown
    let continuo = false
    const req = { auth } as Request
    const res = {
      status: (codigo: number) => {
        status = codigo
        return res
      },
      json: (contenido: unknown) => {
        body = contenido
        return res
      },
    } as unknown as Response
    const next: NextFunction = () => {
      continuo = true
    }

    requiereRol(rol)(req, res, next)
    return { status, body, continuo }
  }

  test('permite una cuenta con exactamente el rol solicitado', () => {
    expect(ejecutar({ usuarioId: 'u1', roles: ['docente'] }, 'docente')).toEqual({
      status: 200,
      body: undefined,
      continuo: true,
    })
  })

  test('rechaza una cuenta con cero o más de un rol', () => {
    expect(ejecutar({ usuarioId: 'u1', roles: [] }, 'estudiante').status).toBe(403)
    expect(
      ejecutar({ usuarioId: 'u1', roles: ['estudiante', 'docente'] }, 'estudiante'),
    ).toMatchObject({
      status: 403,
      body: { error: { code: 'ROL_INVALIDO' } },
      continuo: false,
    })
  })

  test('rechaza el rol de otra área', () => {
    expect(ejecutar({ usuarioId: 'u1', roles: ['afiliado'] }, 'docente')).toMatchObject({
      status: 403,
      body: { error: { code: 'ROL_INSUFICIENTE' } },
      continuo: false,
    })
  })

  test('exige MFA antes de permitir acceso al área docente', () => {
    expect(
      ejecutar({ usuarioId: 'u1', roles: ['docente'], mfaPendiente: true }, 'docente'),
    ).toMatchObject({
      status: 403,
      body: { error: { code: 'MFA_REQUERIDO' } },
      continuo: false,
    })
    expect(ejecutar({ usuarioId: 'u1', roles: ['docente'] }, 'docente').continuo).toBe(true)
  })
})

describe('rolesAplicacionDeGrupos', () => {
  test('normaliza el grupo legado admin a docente', () => {
    expect(rolesAplicacionDeGrupos(['admin'])).toEqual(['docente'])
  })

  test('admin y docente cuentan como un único rol durante la transición', () => {
    expect(rolesAplicacionDeGrupos(['admin', 'docente'])).toEqual(['docente'])
  })

  test('rechaza cuentas que mezclan roles distintos', () => {
    expect(rolesAplicacionDeGrupos(['admin', 'estudiante'])).toEqual([])
    expect(rolesAplicacionDeGrupos(['estudiante', 'afiliado'])).toEqual([])
  })
})
