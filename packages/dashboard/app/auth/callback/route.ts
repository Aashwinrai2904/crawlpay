import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Exchanges the magic-link code for a session, then lands on /dashboard. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Sign-in+link+is+invalid+or+expired`);
}
