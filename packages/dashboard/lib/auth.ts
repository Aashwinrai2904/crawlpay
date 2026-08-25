import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth-options";
import { prisma } from "./prisma";

/**
 * Every dashboard page under /dashboard calls this first. There's no
 * database trigger provisioning a Publisher row on sign-in (NextAuth's
 * Prisma adapter only knows about its own User table), so the upsert here
 * is the only place a Publisher row gets created -- not just a fallback.
 */
export async function requirePublisher() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const publisher = await prisma.publisher.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id },
  });

  return { user: session.user, publisher };
}
