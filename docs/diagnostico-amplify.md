# Diagnóstico del despliegue Amplify

Aplicación: `edtech-solution` (`ddgj3exz5re93`), región `us-east-1`, rama `main`.

## Causas detectadas

1. **Rutas de compilación inconsistentes.** Los comandos cambiaban de directorio entre fases y buscaban `apps/web` desde otra ubicación. Se fija `frontend.buildPath: /`; instalación, archivo de entorno y artefactos se referencian desde la raíz del repositorio.
2. **Dependencias restauradas con una estructura incompatible.** El lockfile usa `configVersion: 1`, que activa el linker aislado de Bun en un monorepo. Next debe ser un enlace a `node_modules/.bun`, donde están sus dependencias transitivas. Una carpeta de Next restaurada sin ese enlace puede conservarse incluso con `bun install --force`, y Node no encuentra `styled-jsx` ni `@swc/helpers`.

La variable `AMPLIFY_MONOREPO_APP_ROOT=apps/web` ya existía a nivel de aplicación. Revisar únicamente las variables de la rama llevó a un diagnóstico inicial incorrecto: no faltaba la raíz de la aplicación. También se explicitó el mismo valor en la rama para mantener la configuración consistente.

## Evidencia de las ejecuciones

| Ejecución | Fallo observado                                                  |
| --------- | ---------------------------------------------------------------- |
| 1         | `cd ../..` repetido; no se encuentra `apps/web`.                 |
| 2         | Se busca `apps/web` desde el directorio del frontend.            |
| 3         | Compila Next; falla la ubicación de los artefactos.              |
| 4         | Caché restaurado; no se encuentra `styled-jsx/package.json`.     |
| 5         | El directorio cambió; la raíz no tiene script `build`.           |
| 6         | Persiste el fallo de `styled-jsx`.                               |
| 7         | `cd apps/web` desde otro nivel del árbol falla.                  |
| 8         | `CODEBUILD_SRC_DIR` no apunta al repositorio en este entorno.    |
| 9         | Rutas corregidas; persiste el fallo de dependencias restauradas. |
| 10        | Añadir `styled-jsx` solo desplaza el fallo a `@swc/helpers`.     |

## Corrección

- Compilar desde la raíz mediante `buildPath: /` y publicar `apps/web/.next`.
- Verificar que existen el lockfile y el paquete web antes de limpiar.
- Eliminar exclusivamente los directorios generados `node_modules` y `apps/web/node_modules` antes de instalar en el entorno de build.
- Instalar Bun `1.3.14` y las versiones del lockfile con `--frozen-lockfile`.
- Guardar únicamente el caché de compilación `.next/cache`; no restaurar dependencias instaladas.
- Retirar la dependencia directa de `styled-jsx` añadida como parche: Next ya la declara y el lockfile conserva su versión.

## Verificación

- Una copia limpia en Linux, con Node 22 y Bun 1.3.14, instaló y completó la compilación de Next 15.5.25, validación de tipos y generación de páginas.
- La reproducción convirtió el enlace de Next en una carpeta normal y repitió `bun install --force --frozen-lockfile`: el enlace no se reparó y apareció exactamente `Cannot find module '@swc/helpers/_/_interop_require_default'`, igual que en AWS.
- La limpieza propuesta reparó esa misma copia contaminada, sin agregar dependencias directas: instalación congelada, arranque de Next, compilación completa, validación de tipos, generación de 54 páginas y trazas terminaron con código de salida 0.

Publicar la web no verifica todavía el flujo completo de afiliación, compra y aviso IoT: API Gateway low-cost, funciones, variables operativas y callbacks de Cognito requieren su propia validación.
