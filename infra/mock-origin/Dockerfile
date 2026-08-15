FROM node:20-alpine

WORKDIR /repo
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter mock-origin build

WORKDIR /repo/infra/mock-origin
EXPOSE 4000
CMD ["node", "dist/index.js"]
