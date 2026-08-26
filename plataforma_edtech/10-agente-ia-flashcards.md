# 10 — Agente de IA: generación de flashcards con Bedrock

## 1. El flujo completo

```
Admin edita el contenido de un tomo en catalog
   → catalog.contenido-actualizado.v1  (trae contenidoHash + lecciones)
   → EventBridge → sqs-flashcards
   → poller de flashcards:
        ¿existe ya un mazo con ese (tomoId, contenidoHash)?
           sí → no hace nada (caché, §5)
           no → crea Mazo(estado=GENERANDO) y encola en sqs-flashcards-generacion
   → worker de generación:
        invoca al Bedrock Agent  ← puede tardar 30-90 s
        recibe JSON de tarjetas
        valida el shape · crea las tarjetas en PENDIENTE_REVISION
        Mazo → EN_REVISION · emite flashcards.mazo-generado.v1
   → notifications avisa al admin
   → Admin revisa en el panel: aprueba / edita / rechaza tarjeta por tarjeta
   → al aprobar al menos una: Mazo → PUBLICADO · flashcards.mazo-publicado.v1
   → el estudiante ve SOLO las tarjetas en estado PUBLICADA
```

**Dos colas y no una** porque los tiempos son incompatibles: el poller de eventos debe
responder en milisegundos, y una invocación a Bedrock tarda decenas de segundos. Meterlas
en la misma cola obligaría a un `visibility_timeout` enorme para todos los eventos.

## 2. El model ID (D8/H8)

El mega-prompt dice "Claude Sonnet 4.6 vía Bedrock". **Ese identificador no se hardcodea.**
Dos razones concretas, las dos rompen en producción:

1. El catálogo de Bedrock varía por región y cambia con el tiempo.
2. Los modelos de Bedrock **requieren habilitación explícita** en la cuenta. Un model ID
   correcto pero no habilitado devuelve `AccessDeniedException` en runtime, dentro de una
   Lambda, donde nadie lo ve hasta que un admin se queja.

Procedimiento obligatorio, **en tiempo de build**:

```bash
aws bedrock list-foundation-models --region us-east-1 \
  --by-provider anthropic \
  --query 'modelSummaries[?contains(modelId,`sonnet`)].[modelId,modelLifecycle.status]' \
  --output table

# y verificar que esté HABILITADO en la cuenta, no solo que exista:
aws bedrock get-foundation-model-availability --model-id <id> --region us-east-1
```

El id elegido se escribe en `infra/envs/dev/ai.tfvars` como `bedrock_model_id` y en
`DECISIONS.md`. **Preferir un inference profile** (`us.anthropic.…`) sobre un model ID
directo cuando esté disponible: da failover entre regiones y mejor disponibilidad bajo
carga.

Si ningún Sonnet está habilitado, Fable **no inventa un id**: registra el hallazgo en
`DECISIONS.md`, usa el modelo Anthropic más capaz que **sí** esté habilitado, y deja escrito
qué hay que pedir en la consola de Bedrock para tener el preferido.

## 3. Bedrock Agent vs invocación directa

El mega-prompt pide un **Bedrock Agent nativo** (`aws_bedrockagent_agent` +
`aws_bedrockagent_agent_action_group`). Se respeta, con una observación honesta escrita en
`DECISIONS.md`:

> Para *este* caso de uso —una sola llamada, prompt fijo, salida JSON, sin herramientas ni
> conversación— un `InvokeModel` directo sería más simple, más barato y más fácil de probar.
> El Agent aporta cuando hay varias herramientas, memoria de sesión o razonamiento en
> varios pasos. Se construye el Agent porque está pedido y porque deja lista la
> infraestructura para el tutor conversacional que sí lo necesitará (doc 15, deuda).
> **El `GeneradorFlashcardsPort` hace que cambiar de uno a otro sea una clase**, no un
> refactor.

Terraform (módulo `ai/`):

```hcl
resource "aws_bedrockagent_agent" "flashcards" {
  agent_name              = "edtech-dev-flashcards"
  foundation_model        = var.bedrock_model_id          # §2, nunca literal
  agent_resource_role_arn = aws_iam_role.bedrock_agent.arn
  idle_session_ttl_in_seconds = 600
  instruction = file("${path.module}/prompts/flashcards.txt")
}

resource "aws_bedrockagent_agent_action_group" "generar" {
  agent_id          = aws_bedrockagent_agent.flashcards.id
  agent_version     = "DRAFT"
  action_group_name = "generar-flashcards"
  action_group_executor { lambda = aws_lambda_function.action_group.arn }
  api_schema { payload = file("${path.module}/schemas/generar-flashcards.json") }
}
```

## 4. El puerto y el prompt

```ts
// domain/ports-out/generador-flashcards.port.ts
export interface GeneradorFlashcardsPort {
  generar(input: {
    tomoTitulo: string
    cursoTecnologia: string
    nivel: LetraNivel
    lecciones: { titulo: string; contenido: string }[]
    cantidadDeseada: number
  }): Promise<Result<{ tarjetas: { anverso: string; reverso: string }[]; modeloUsado: string },
                     GeneracionError>>
}
```

El dominio de flashcards **no sabe** que existe AWS, Bedrock, SQS ni una Lambda. En tests,
el puerto se reemplaza por un doble que devuelve tarjetas fijas — y así los tests de
aplicación corren en milisegundos y sin costo.

Instrucción del agente (`prompts/flashcards.txt`), resumida:

```
Eres un diseñador de material de estudio para una plataforma de cursos de programación.
A partir del contenido de un tomo, genera entre 8 y 15 flashcards de repaso.

Reglas:
- El anverso es una pregunta concreta o un concepto a recordar. Máximo 120 caracteres.
- El reverso es la respuesta, autocontenida. Máximo 400 caracteres.
- Adecúa la profundidad al nivel indicado (A = principiante absoluto, N = profesional).
- Incluye al menos 2 tarjetas con un fragmento de código corto cuando el tema lo permita.
- NO inventes APIs, métodos ni sintaxis que no aparezcan en el contenido dado.
- NO generes preguntas de opción múltiple: son flashcards, no un examen.
- Escribe en español, tuteando, con tono directo.
- Devuelve EXCLUSIVAMENTE un JSON válido con la forma:
  {"tarjetas":[{"anverso":"...","reverso":"..."}]}
```

La regla de "no inventes APIs" es la que importa: es la alucinación más probable y la más
dañina en material educativo. La red de seguridad real, de todos modos, es el HITL (§6).

**Validación de la salida**, antes de tocar la base:

1. Parseo JSON. Si falla → un reintento con el mensaje de error como corrección; si vuelve
   a fallar → `flashcards.generacion-fallida.v1`.
2. Validación de shape y límites (cantidad entre 8 y 20, longitudes, campos no vacíos).
3. Deduplicación por anverso normalizado.
4. Se descarta cualquier tarjeta con el anverso o el reverso vacíos.

## 5. Caché por hash de contenido

`catalog.lecciones.contenido_hash` es el sha256 de los bloques de la lección (doc 03 §5).
El hash del tomo es el sha256 de la concatenación ordenada de los hashes de sus lecciones.

`flashcards.mazos` tiene `UNIQUE (tomo_id, contenido_hash)`: si llega un evento
`contenido-actualizado` cuyo hash coincide con un mazo existente, **no se invoca al
modelo**. Esto importa porque el evento se dispara con cualquier edición, incluido corregir
una tilde en un título, y cada invocación cuesta dinero y 60 segundos.

**Regeneración.** Si el hash cambió, se crea un mazo **versión N+1** en revisión. El mazo
N sigue publicado y visible para el estudiante hasta que el admin apruebe el nuevo. Nunca
hay un hueco donde el estudiante se quede sin flashcards.

## 6. HITL: la regla que no se negocia

**Ninguna tarjeta llega al estudiante sin aprobación humana.** Sin excepción, sin bypass de
admin "para probar rápido", sin flag de entorno.

- Se garantiza en el **repositorio** (doc 03 §8, I-8), no en el controlador: el método
  `porTomoParaEstudiante()` filtra `estado = 'PUBLICADA'` en el SQL. Un endpoint nuevo que
  se olvide del filtro no puede exponer tarjetas sin revisar, porque no tiene forma de
  pedirlas.
- El panel de admin permite **editar** el texto antes de aprobar; una tarjeta editada
  guarda `editada = true`, lo que a los meses responde la pregunta "¿cuán bueno es el
  modelo realmente?" con datos en vez de con impresiones.
- Rechazar exige un motivo. Es lo que permite mejorar el prompt con evidencia.

## 7. Costo y control

| Concepto | Estimación |
|---|---|
| Tokens de entrada por tomo | ~4.000 (contenido de 4 lecciones) |
| Tokens de salida por tomo | ~1.500 (12 tarjetas) |
| Costo por generación | del orden de $0,03-0,05 |
| Generaciones en el catálogo inicial | 6 tomos → una vez |

Es despreciable con este catálogo. Lo que **no** es despreciable es un bucle: un evento que
dispara una generación que actualiza contenido que dispara otro evento. Protecciones:

1. `flashcards` **nunca** escribe en `catalog`. El ciclo es estructuralmente imposible.
2. La caché por hash (§5) corta cualquier reintento sobre contenido idéntico.
3. Máximo **3 intentos** de generación por (tomo, hash). Al cuarto,
   `flashcards.generacion-fallida.v1` y se detiene.
4. Alarma de CloudWatch sobre `InvokeModel` count > 50/hora en `dev`.

## 8. Local

Bedrock **no** está en LocalStack. En `docker compose`, `GENERADOR_FLASHCARDS=fake` hace
que el `.di.ts` inyecte un `FakeGeneradorFlashcards` que devuelve 10 tarjetas plausibles
con 2 s de retraso simulado. Todo el flujo —evento, cola, worker, estados, HITL, panel de
admin— se prueba entero en local sin gastar un centavo ni depender de la red.

La invocación real a Bedrock se prueba contra AWS `dev` en la fase F11 (doc 14), que es
donde se descubren las cosas que un fake no reproduce: latencia real, throttling, y si el
modelo devuelve JSON tan limpio como promete.
