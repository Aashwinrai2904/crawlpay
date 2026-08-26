import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth-options";
import { prisma } from "./prisma";

/**
 * Every dashboard page under /dashboard calls this first -- both the
 * layout and the page itself, which Next.js can invoke concurrently, so on
 * a first-ever sign-in two calls can both miss the upsert's existence
 * check and race to create the same Publisher row. Postgres's unique
 * constraint on user_id catches the loser as a P2002, which just means
 * "someone else already created it" -- re-fetch instead of erroring.
 *
 * There's no database trigger provisioning a Publisher row on sign-in
 * (NextAuth's Prisma adapter only knows about its own User table), so this
 * is the only place a Publisher row gets created -- not just a fallback.
 */
export async function requirePublisher() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  let publisher;
  try {
    publisher = await prisma.publisher.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      publisher = await prisma.publisher.findUniqueOrThrow({ where: { userId } });
    } else {
      throw error;
    }
  }

  return { user: session.user, publisher };
}
