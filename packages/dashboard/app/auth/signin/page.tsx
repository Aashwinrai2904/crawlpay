"use client";

import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    await signIn("email", { email, callbackUrl: "/dashboard", redirect: false });
    setSubmitting(false);
    setSent(true);
  }

  return (
    <main className="page" style={{ maxWidth: 420 }}>
      <div className="card stack">
        <div>
          <h1>Sign in to CrawlPay</h1>
          <p className="text-muted">We&apos;ll email you a magic link — no password needed.</p>
        </div>
        {sent ? (
          <p>
            Check <strong>{email}</strong> for a sign-in link.
          </p>
        ) : (
          <form className="stack" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@publisher.com"
                style={{ width: "100%" }}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
