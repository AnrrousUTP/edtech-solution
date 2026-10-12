# Diagnóstico del despliegue Amplify

Aplicación: `edtech-solution` (`ddgj3exz5re93`), región `us-east-1`, rama `main`.

## Causas detectadas

1. **Rutas de compilación inconsistentes.** Los comandos cambiaban de directorio entre fases y buscaban `apps/web` desde otra ubicación. Se fija `frontend.buildPath: /`; instalación, archivo de entorno y artefactos se referencian desde la raíz del repositorio.
2. **Dependencias restauradas con una estructura incompatible.** El lockfile usa `configVersion: 1`, que activa el linker aislado de Bun en un monorepo. Next debe ser un enlace a `node_modules/.bun`, donde están sus dependencias transitivas. Una carpeta de Next restaurada sin ese enlace puede conservarse incluso con `bun install --force`, y Node no encuentra `styled-jsx` ni `@swc/helpers`.
3. **Empaquetado SSR de Amplify.** Tras limpiar las dependencias, AWS completó la compilación, los tipos y las 54 páginas. El empaquetador rechazó la instalación aislada porque no encontraba `next` en el `node_modules` de la raíz. Se usa el linker `hoisted` únicamente en el build de Amplify y se verifica la resolución de Next y sus dependencias antes de compilar.

La variable `AMPLIFY_MONOREPO_APP_ROOT=apps/web` ya existía a nivel de aplicación. Revisar únicamente las variables de la rama llevó a un diagnóstico inicial incorrecto: no faltaba la raíz de la aplicación. También se explicitó el mismo valor en la rama para mantener la configuración consistente.

## Evidencia de las ejecuciones

| Ejecución | Fallo observado                                                                  |
| --------- | -------------------------------------------------------------------------------- |
| 1         | `cd ../..` repetido; no se encuentra `apps/web`.                                 |
| 2         | Se busca `apps/web` desde el directorio del frontend.                            |
| 3         | Compila Next; falla la ubicación de los artefactos.                              |
| 4         | Caché restaurado; no se encuentra `styled-jsx/package.json`.                     |
| 5         | El directorio cambió; la raíz no tiene script `build`.                           |
| 6         | Persiste el fallo de `styled-jsx`.                                               |
| 7         | `cd apps/web` desde otro nivel del árbol falla.                                  |
| 8         | `CODEBUILD_SRC_DIR` no apunta al repositorio en este entorno.                    |
| 9         | Rutas corregidas; persiste el fallo de dependencias restauradas.                 |
| 10        | Añadir `styled-jsx` solo desplaza el fallo a `@swc/helpers`.                     |
| 11        | Compilación completa correcta; el empaquetador SSR no encuentra Next en la raíz. |
| 12        | Build, Deploy y Verify exitosos con instalación limpia y linker `hoisted`.       |

## Corrección

La ejecución 11 completó la compilación y falló después, al empaquetar SSR por la ausencia de Next en el `node_modules` raíz.

- Compilar desde la raíz mediante `buildPath: /` y publicar `apps/web/.next`.
- Verificar que existen el lockfile y el paquete web antes de limpiar.
- Eliminar exclusivamente los directorios generados `node_modules` y `apps/web/node_modules` antes de instalar en el entorno de build.
- Instalar Bun `1.3.14` y las versiones del lockfile con `--frozen-lockfile --linker hoisted`, para generar la estructura que necesita el empaquetador SSR.
- Comprobar explícitamente la resolución desde la raíz de `next`, `styled-jsx`, `@swc/helpers`, `@next/env`, `caniuse-lite` y `postcss`.
- Guardar únicamente el caché de compilación `.next/cache`; no restaurar dependencias instaladas.
- Retirar la dependencia directa de `styled-jsx` añadida como parche: Next ya la declara y el lockfile conserva su versión.

## Verificación

- Una copia limpia en Linux, con Node 22 y Bun 1.3.14, instaló y completó la compilación de Next 15.5.25, validación de tipos y generación de páginas.
- La reproducción convirtió el enlace de Next en una carpeta normal y repitió `bun install --force --frozen-lockfile`: el enlace no se reparó y apareció exactamente `Cannot find module '@swc/helpers/_/_interop_require_default'`, igual que en AWS.
- La limpieza propuesta reparó esa misma copia contaminada, sin agregar dependencias directas: instalación congelada, arranque de Next, compilación completa, validación de tipos, generación de 54 páginas y trazas terminaron con código de salida 0.
- Con `--linker hoisted`, las seis comprobaciones de dependencias desde la raíz pasaron; la compilación completa volvió a terminar con código 0. El servidor resultante respondió HTTP 200 en la portada y el login; se detuvo al terminar la prueba.
- La ejecución 12 (`a36168d`) completó `BUILD`, `DEPLOY` y `VERIFY`. La portada y `/login` devolvieron HTTP 200 en `https://main.ddgj3exz5re93.amplifyapp.com/` y `/login`. La identidad AWS verificada es `047600599757`.

La publicación confirma el hosting SSR; no confirma todavía el flujo completo de afiliación, compra y aviso IoT. API Gateway low-cost sigue sin rutas y las funciones, variables operativas y callbacks de Cognito requieren su propia integración y validación.

Referencias: [estructura de instalación de Bun](https://bun.com/docs/pm/isolated-installs), [monorepos en Amplify](https://github.com/aws-amplify/amplify-hosting/blob/main/FAQ.md#support-for-monorepo-framework).
