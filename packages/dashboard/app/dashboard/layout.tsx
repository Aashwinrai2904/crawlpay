import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { requirePublisher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, publisher } = await requirePublisher();
  const sites = await prisma.site.findMany({
    where: { publisherId: publisher.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div style={{ minHeight: "100vh" }}>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dashboard" className="brand">
            CrawlPay
          </Link>
          <nav className="app-nav">
            {sites.map((site) => (
              <Link key={site.id} href={`/dashboard/sites/${site.id}/pricing`}>
                {site.domain}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <span className="header-email">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="container" style={{ padding: "2rem 1.5rem" }}>
        {children}
      </main>
    </div>
  );
}
