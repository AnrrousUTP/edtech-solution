import { describe, expect, test } from 'bun:test'
import { calcularComision, ingresoNeto } from './comision.vo'
describe('Ingresos por referido', () => {
  test('5% y redondeo sin flotantes', () => {
    expect(calcularComision(4000)).toBe(200)
    expect(calcularComision(2000)).toBe(100)
    expect(calcularComision(10)).toBe(1)
    expect(calcularComision(0)).toBe(0)
    expect(() => calcularComision(-1)).toThrow()
    expect(() => calcularComision(3.5)).toThrow()
  })
  test('reembolsos parciales y totales calculan sobre la base restante', () => {
    expect(ingresoNeto(4000, 1000)).toBe(150)
    expect(ingresoNeto(4000, 4000)).toBe(0)
    expect(ingresoNeto(4000, 6000)).toBe(0)
    expect(ingresoNeto(29, 9)).toBe(1)
  })
})
