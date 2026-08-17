import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { createClient } from "./supabase/server";

/**
 * Every dashboard page under /dashboard calls this first. The
 * on_auth_user_created trigger provisions a Publisher row on first
 * sign-in, so the upsert here is a fallback (a session predating the
 * trigger, or a rare race), not the normal path.
 */
export async function requirePublisher() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const publisher = await prisma.publisher.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id },
  });

  return { user, publisher };
}
