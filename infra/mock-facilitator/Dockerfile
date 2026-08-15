FROM node:20-alpine

WORKDIR /repo
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter mock-facilitator build

WORKDIR /repo/infra/mock-facilitator
EXPOSE 4100
CMD ["node", "dist/index.js"]
