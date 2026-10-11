FROM oven/bun:1-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared-kernel packages/shared-kernel
COPY apps/terminal-simulator apps/terminal-simulator
RUN bun install --production --ignore-scripts && mkdir /data && chown bun:bun /data
USER bun
CMD ["bun","run","apps/terminal-simulator/src/main.ts"]
