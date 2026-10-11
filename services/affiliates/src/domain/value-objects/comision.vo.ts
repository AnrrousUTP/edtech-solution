export const calcularComision = (baseCentavos: number, tasaBps = 500): number => {
  if (
    !Number.isSafeInteger(baseCentavos) ||
    baseCentavos < 0 ||
    baseCentavos > 999999999999 ||
    tasaBps !== 500
  )
    throw new Error('Base de comisión o porcentaje inválido')
  return Number((BigInt(baseCentavos) * BigInt(tasaBps) + 5000n) / 10000n)
}
export const ingresoNeto = (baseCentavos: number, reembolsadoCentavos: number): number =>
  calcularComision(Math.max(0, baseCentavos - Math.min(baseCentavos, reembolsadoCentavos)))
