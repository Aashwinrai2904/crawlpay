import { signInWithMagicLink } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>CrawlPay</h1>
      <p>Sign in with a magic link — no password needed.</p>
      <form action={signInWithMagicLink}>
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          required
          style={{ width: "100%", padding: "0.5rem", marginBottom: "0.75rem" }}
        />
        <button type="submit" style={{ width: "100%", padding: "0.5rem" }}>
          Send magic link
        </button>
      </form>
      {searchParams.error ? (
        <p style={{ color: "crimson", marginTop: "1rem" }}>{searchParams.error}</p>
      ) : null}
    </main>
  );
}
