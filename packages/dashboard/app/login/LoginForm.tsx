"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) {
      setError("Enter an email address");
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await signIn("email", {
      email,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push("/login/check-email");
  }

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>CrawlPay</h1>
      <p>Sign in with a magic link — no password needed.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          required
          style={{ width: "100%", padding: "0.5rem", marginBottom: "0.75rem" }}
        />
        <button type="submit" disabled={submitting} style={{ width: "100%", padding: "0.5rem" }}>
          {submitting ? "Sending…" : "Send magic link"}
        </button>
      </form>
      {error ? <p style={{ color: "crimson", marginTop: "1rem" }}>{error}</p> : null}
    </main>
  );
}
