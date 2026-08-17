import Link from "next/link";
import type { ReactNode } from "react";
import { requirePublisher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, publisher } = await requirePublisher();
  const sites = await prisma.site.findMany({
    where: { publisherId: publisher.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 1.5rem",
          borderBottom: "1px solid #ddd",
        }}
      >
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <Link href="/dashboard" style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}>
            CrawlPay
          </Link>
          <nav style={{ display: "flex", gap: "1rem" }}>
            {sites.map((site) => (
              <Link key={site.id} href={`/dashboard/sites/${site.id}/pricing`}>
                {site.domain}
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{ color: "#666", fontSize: "0.875rem" }}>{user.email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main style={{ padding: "1.5rem" }}>{children}</main>
    </div>
  );
}
