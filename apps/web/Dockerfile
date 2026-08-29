# Build estático + SSR en el mismo contenedor ECS (doc 11 §1). No se usa Vercel:
# todo el stack es AWS y meter otro proveedor agrega otra factura y otro punto
# de fallo.
#
# A-40: el frontend se construye como proyecto AISLADO, no como workspace del
# monorepo. Motivo: dentro de un workspace, bun deja los binarios en su store
# (node_modules/.bun/...) y `next` no llega al PATH ni a node_modules/.bin, así
# que el build no arranca. El frontend no importa nada del monorepo —solo su
# propio alias `@/`—, así que aislarlo no rompe ninguna frontera.
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY apps/web/package.json ./
RUN bun install

COPY apps/web/next.config.mjs apps/web/postcss.config.mjs apps/web/tailwind.config.ts apps/web/tsconfig.json ./
COPY apps/web/src ./src
COPY apps/web/public ./public
ENV NEXT_TELEMETRY_DISABLED=1 SALIDA_STANDALONE=1
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER bun
EXPOSE 3000
CMD ["bun", "run", "server.js"]
