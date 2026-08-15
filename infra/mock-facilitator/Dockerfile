FROM node:22-alpine

WORKDIR /repo
RUN npm install -g pnpm@11.21.0

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter mock-facilitator build

WORKDIR /repo/infra/mock-facilitator
EXPOSE 4100
CMD ["node", "dist/index.js"]
