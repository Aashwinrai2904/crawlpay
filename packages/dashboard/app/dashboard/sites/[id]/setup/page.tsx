import { notFound } from "next/navigation";
import { requirePublisher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SiteSetupPage({ params }: { params: { id: string } }) {
  const { publisher } = await requirePublisher();
  const site = await prisma.site.findFirst({
    where: { id: params.id, publisherId: publisher.id },
  });

  if (!site) {
    notFound();
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://your-dashboard.example.com";

  return (
    <div style={{ display: "grid", gap: "2rem", maxWidth: 700 }}>
      <div>
        <h1>{site.domain}</h1>
        <p style={{ color: "#666" }}>Setup</p>
      </div>

      <section>
        <h2>Deploy key</h2>
        <p style={{ color: "#666" }}>
          Bearer secret for this site — keep it out of source control. The middleware server
          uses it to pull pricing/policy from this dashboard and push transaction records here
          instead of only using its local config file.
        </p>
        <code
          style={{
            display: "block",
            padding: "0.75rem",
            background: "#f5f5f5",
            wordBreak: "break-all",
          }}
        >
          {site.middlewareDeployKey}
        </code>
      </section>

      <section>
        <h2>Configure the middleware</h2>
        <p>Set these on wherever the CrawlPay middleware is deployed (e.g. Render):</p>
        <pre
          style={{
            background: "#f5f5f5",
            padding: "0.75rem",
            overflowX: "auto",
          }}
        >{`CRAWLPAY_DASHBOARD_URL=${dashboardUrl}
CRAWLPAY_DASHBOARD_DEPLOY_KEY=${site.middlewareDeployKey}`}</pre>
        <p style={{ color: "#666" }}>
          The middleware polls <code>GET /api/v1/config</code> here for pricing/policy and calls{" "}
          <code>POST /api/v1/transactions</code> after each verified payment, falling back to its
          local <code>publisher-config.json</code> if this dashboard is unreachable.
        </p>
      </section>

      <section>
        <h2>WordPress plugin</h2>
        <p>
          <strong>Mode A (reverse proxy, recommended):</strong> point your DNS/server config at
          the middleware in front of this site. The middleware handles every request; this
          dashboard is where you manage pricing and policy.
        </p>
        <p>
          <strong>Mode B (shared hosting fallback):</strong> in the CrawlPay plugin&apos;s Settings
          &gt; CrawlPay page, set the Middleware URL to your deployed middleware and the Site key
          to the middleware&apos;s own <code>CRAWLPAY_SITE_KEY</code> (a separate secret from the
          deploy key above — that one authenticates WordPress to the middleware, this one
          authenticates the middleware to this dashboard).
        </p>
      </section>
    </div>
  );
}
