import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Component / Route Handler / Server Action Supabase client. Cookie
 * writes are wrapped in try/catch because Server Components can't write
 * cookies themselves (Next.js throws) -- middleware.ts's session refresh
 * covers that case, this client only needs to write from Route Handlers
 * and Server Actions.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render.
          }
        },
      },
    },
  );
}
