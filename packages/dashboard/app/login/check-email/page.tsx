export default function CheckEmailPage() {
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
      <div className="card" style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>Check your email</h1>
        <p className="muted">We sent you a magic link. Click it to sign in — you can close this tab.</p>
      </div>
    </main>
  );
}
