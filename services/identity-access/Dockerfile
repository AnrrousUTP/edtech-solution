# Imagen del servicio (D5: Bun). Sin bundling: Bun ejecuta TS directamente y el
# kernel carga los schemas JSON de eventos en runtime (A-15).
FROM oven/bun:1-alpine
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared-kernel packages/shared-kernel
COPY services/identity-access services/identity-access

RUN bun install --production --ignore-scripts

LABEL kernel_version="0.1.0"
USER bun
EXPOSE 3000
CMD ["bun", "run", "services/identity-access/src/main.ts"]
