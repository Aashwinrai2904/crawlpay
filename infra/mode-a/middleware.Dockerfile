# Builds the CrawlPay middleware from the repo for the Mode A live-verification
# stack (infra/docker-compose.test-mode-a.yml). Mirrors the mock-origin /
# mock-facilitator Dockerfiles; build context is the repo root.
FROM node:22-alpine

WORKDIR /repo
RUN npm install -g pnpm@11.21.0

COPY . .
RUN pnpm install --frozen-lockfile
# `...` -> build @crawlpay/middleware and everything it depends on (@crawlpay/core).
RUN pnpm --filter "@crawlpay/middleware..." build

WORKDIR /repo/packages/middleware
EXPOSE 8787
CMD ["node", "dist/index.js"]
