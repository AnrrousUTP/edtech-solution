FROM oven/bun:1-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared-kernel packages/shared-kernel
COPY services/iot-terminals services/iot-terminals
RUN bun install --production --ignore-scripts
LABEL kernel_version="0.1.0"
USER bun
EXPOSE 3000
CMD ["bun", "run", "services/iot-terminals/src/main.ts"]
