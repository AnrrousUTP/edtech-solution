// Detección de secretos para I-12 (doc 15 §2).
//
// El grep literal que propone el doc —`client_secret|AQ[A-Za-z0-9]{20,}`— da
// decenas de falsos positivos: el NOMBRE de la variable en la documentación, los
// `sha512-…` del lockfile, el propio texto del invariante citado en los docs. Con
// tantos, un positivo de verdad se pierde entre ellos y la comprobación deja de
// servir para lo único que importa.
//
// Acá se busca lo que de verdad sería una fuga: un VALOR con forma de credencial
// asignado a un nombre de secreto, y tokens con la forma de una clave de PayPal o
// de AWS. Vive en su propio módulo, con test, porque una comprobación de
// seguridad que nadie probó puede estar dando verde sin mirar nada.

const ASIGNACION =
  /(client_secret|secret_key|api_key|password)["' ]*[:=]["' ]*[A-Za-z0-9_/+-]{16,}/i

/** Contextos donde el nombre aparece pero el valor NO está: plantillas, lecturas
 *  de Secrets Manager, variables de Terraform, nombres de secreto. */
const CONTEXTO_SEGURO =
  /PEGAR_AQUI|jsondecode|process\.env|\$\{|var\.|data\.|_SECRET_NAME|<[A-Z_]+>/

const TOKEN = /\b(A[A-Z0-9]{20,}|E[A-Za-z0-9_-]{60,}|AKIA[A-Z0-9]{16})\b/g

/** Identificadores públicos que tienen forma de credencial pero no lo son. */
const CONOCIDOS_INOFENSIVOS = [
  'ABCDEFGHJKMNPQRSTUVWXYZ23456789', // alfabeto del código de certificado (A-29)
]

export type Hallazgo = { tipo: 'asignacion' | 'token'; muestra: string }

export const buscarSecretos = (texto: string): Hallazgo[] => {
  const hallazgos: Hallazgo[] = []

  for (const linea of texto.split('\n')) {
    if (ASIGNACION.test(linea) && !CONTEXTO_SEGURO.test(linea)) {
      hallazgos.push({ tipo: 'asignacion', muestra: linea.trim().slice(0, 80) })
    }
  }

  for (const m of texto.matchAll(TOKEN)) {
    const t = m[0]
    // Los IDs únicos de IAM (AIDA…) son públicos, como un ARN
    if (CONOCIDOS_INOFENSIVOS.includes(t) || t.startsWith('AIDA')) continue
    hallazgos.push({ tipo: 'token', muestra: t.slice(0, 8) + '…' })
  }

  return hallazgos
}
