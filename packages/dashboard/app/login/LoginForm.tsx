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
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div className="card" style={{ maxWidth: 380, width: "100%" }}>
        <span className="badge" style={{ marginBottom: "1.25rem" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)" }} />
          Publisher sign-in
        </span>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>CrawlPay</h1>
        <p className="muted" style={{ marginBottom: "1.5rem" }}>
          Sign in with a magic link — no password needed.
        </p>
        <form onSubmit={handleSubmit} className="stack" style={{ gap: "0.75rem" }}>
          <input type="email" name="email" placeholder="you@example.com" required />
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "Sending…" : "Send magic link"}
          </button>
        </form>
        {error ? (
          <p style={{ color: "var(--pink)", fontSize: "0.875rem", marginTop: "1rem" }}>{error}</p>
        ) : null}
      </div>
    </main>
  );
}
