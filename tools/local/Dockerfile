FROM oven/bun:1-alpine
WORKDIR /repo
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared-kernel packages/shared-kernel
COPY tools tools
RUN bun install --ignore-scripts
USER bun
CMD ["bun","run","tools/local/secrets-bootstrap.ts"]
