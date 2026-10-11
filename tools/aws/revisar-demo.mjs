import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Límite acordado: créditos consumidos por esta demostración, no pago adicional.
export const limits = Object.freeze({
  account: '047600599757', region: 'us-east-1', profile: 'edtech',
  startingCredits: 89.81, target: 10, maximum: 15, reserve: 3,
  model: 'amazon.nova-micro-v1:0',
})

export function assess({ identity, plan, availability, natGateways, loadBalancers }) {
  const blockers = []
  if (identity.Account !== limits.account) blockers.push('La cuenta no es la del proyecto.')
  if (plan.accountPlanType !== 'FREE' || plan.accountPlanStatus !== 'ACTIVE') {
    blockers.push('No se verificó un plan FREE activo. No habilitar pago.')
  }
  const credits = plan.accountPlanRemainingCredits
  const remaining = Number(credits?.amount)
  if (credits?.unit !== 'USD' || !Number.isFinite(remaining) || remaining < 0) {
    blockers.push('No se pudo verificar el saldo de créditos en USD.')
  } else if (remaining < limits.startingCredits - limits.maximum + limits.reserve) {
    blockers.push('Saldo por debajo del margen previo al máximo de USD 15. No iniciar otra demo.')
  }
  if (availability.authorizationStatus !== 'AUTHORIZED' ||
      availability.regionAvailability !== 'AVAILABLE' ||
      availability.entitlementAvailability !== 'AVAILABLE') {
    blockers.push('Bedrock no está autorizado o disponible. Resolver el acceso antes de publicar la IA.')
  }
  const nat = natGateways.filter(item => item.State === 'available')
  const alb = loadBalancers.filter(item => item.State?.Code === 'active')
  if (nat.length || alb.length) {
    blockers.push('Hay NAT Gateway o balanceador activo: cerrar el plan de retirada por horas antes de desplegar más recursos.')
  }
  return {
    checkedAt: new Date().toISOString(), account: identity.Account,
    plan: plan.accountPlanType, remainingCreditsUsd: Number.isFinite(remaining) ? remaining : null,
    targetCreditsUsd: limits.target, maximumCreditsUsd: limits.maximum,
    baselineCreditsUsd: limits.startingCredits,
    // Es una señal de saldo, NO un cálculo de consumo: puede haber créditos nuevos,
    // consumo de otros proyectos o demora en la contabilización.
    balanceChangeUsd: Number.isFinite(remaining) ? Math.max(0, limits.startingCredits - remaining) : null,
    bedrock: { model: limits.model, authorization: availability.authorizationStatus },
    fixedResources: {
      natGateways: nat.map(item => item.NatGatewayId),
      loadBalancers: alb.map(item => item.LoadBalancerName),
    },
    ready: blockers.length === 0, blockers,
    limitation: 'Comprobación previa de lectura. No corta servicios, no ejecuta Terraform y no garantiza un techo de consumo. La contabilidad puede retrasarse.',
  }
}

export function collect(aws) {
  const identity = aws(['sts', 'get-caller-identity'])
  // Detener aquí: una cuenta equivocada no debe recibir las consultas siguientes.
  if (identity.Account !== limits.account) throw new Error('Cuenta equivocada. Usar el perfil edtech.')
  const plan = aws(['freetier', 'get-account-plan-state'])
  const availability = aws(['bedrock', 'get-foundation-model-availability', '--model-id', limits.model])
  const natGateways = aws(['ec2', 'describe-nat-gateways', '--filter', 'Name=tag:Project,Values=edtech']).NatGateways
  const loadBalancers = aws([
    'elbv2', 'describe-load-balancers', '--query', "LoadBalancers[?LoadBalancerName=='edtech-dev-alb']",
  ])
  if (!Array.isArray(natGateways) || !Array.isArray(loadBalancers)) {
    throw new Error('Inventario incompleto. No asumir ausencia de recursos.')
  }
  return assess({ identity, plan, availability, natGateways, loadBalancers })
}

async function main() {
  const aws = args => JSON.parse(execFileSync('aws', [
    ...args, '--profile', limits.profile, '--region', limits.region,
    '--output', 'json', '--no-cli-pager', '--cli-connect-timeout', '10', '--cli-read-timeout', '15',
  ], { encoding: 'utf8', timeout: 35000, stdio: ['ignore', 'pipe', 'pipe'] }))
  try {
    const report = collect(aws)
    const folder = new URL('../../.local/aws-review/', import.meta.url)
    await mkdir(folder, { recursive: true })
    await writeFile(new URL('preflight.json', folder), JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.ready ? 0 : 2
  } catch {
    // No volcar el entorno ni la salida completa de errores de las credenciales.
    console.error('No se completó la revisión AWS. Comprobar perfil edtech, acceso y conexión; no ejecutar apply todavía.')
    process.exitCode = 1
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
