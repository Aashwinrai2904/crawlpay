FROM node:22-alpine

WORKDIR /repo
RUN npm install -g pnpm@11.21.0

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter mock-origin build

WORKDIR /repo/infra/mock-origin
EXPOSE 4000
CMD ["node", "dist/index.js"]
