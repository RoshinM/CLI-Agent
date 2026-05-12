FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV AGENT_WORKSPACE=/app

COPY package.json pnpm-lock.yaml tsconfig.json ./

RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && pnpm install --no-frozen-lockfile

COPY . .

CMD ["node", "GAgent.ts"]
