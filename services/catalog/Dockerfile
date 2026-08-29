# Imagen del servicio (D5: Bun; A-15: sin bundle).
FROM oven/bun:1-alpine
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared-kernel packages/shared-kernel
COPY services/catalog services/catalog

RUN bun install --production --ignore-scripts

LABEL kernel_version="0.1.0"
USER bun
EXPOSE 3000
CMD ["bun", "run", "services/catalog/src/main.ts"]
