import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode singleton: without this, every hot-reload of a
// module that imports `prisma` would open a fresh connection pool against
// Postgres until it runs out of connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
