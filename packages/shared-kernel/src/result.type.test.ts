import { describe, expect, test } from 'bun:test'
import { Err, isErr, isOk, Ok } from './result.type'

describe('Result', () => {
  test('Ok lleva el valor y las guardas lo estrechan', () => {
    const r = Ok(42)
    expect(isOk(r)).toBe(true)
    expect(isErr(r)).toBe(false)
    if (isOk(r)) expect(r.value).toBe(42)
  })

  test('Err lleva el error', () => {
    const r = Err(new Error('falló'))
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.message).toBe('falló')
  })
})
