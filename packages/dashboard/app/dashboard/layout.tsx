import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "../../components/sign-out-button";
import { requireCurrentPublisher } from "../../lib/current-publisher";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const publisher = await requireCurrentPublisher();

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <div className="row">
            <Link href="/dashboard" style={{ fontWeight: 700, textDecoration: "none" }}>
              CrawlPay
            </Link>
            <div className="nav-links">
              <Link href="/dashboard">Overview</Link>
            </div>
          </div>
          <div className="row">
            <span className="text-muted">{publisher.email}</span>
            <SignOutButton />
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}
