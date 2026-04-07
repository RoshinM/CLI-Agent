FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV AGENT_WORKSPACE=/app

COPY package.json pnpm-lock.yaml tsconfig.json ./

RUN corepack enable && pnpm install --no-frozen-lockfile

COPY . .

CMD ["node", "GAgent.ts"]
