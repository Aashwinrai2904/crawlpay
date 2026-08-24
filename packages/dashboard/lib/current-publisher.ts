import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

/**
 * Every /dashboard page needs the logged-in publisher; redirect straight to
 * sign-in rather than making every page re-implement that check. Session
 * strategy is "database" (not JWT), so this only works from a server
 * context that can reach Postgres directly — Route Handlers and Server
 * Components, not edge middleware.
 */
export async function requireCurrentPublisher() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const publisher = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { sites: { orderBy: { createdAt: "asc" } } },
  });

  if (!publisher) {
    redirect("/auth/signin");
  }

  return publisher;
}
