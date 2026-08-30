import { notFound } from "next/navigation";
import { requirePublisher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateDeployKey } from "@/app/dashboard/actions";

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
    <div className="stack" style={{ maxWidth: 700 }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>{site.domain}</h1>
        <p className="muted">Setup</p>
      </div>

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Deploy key</h2>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          Bearer secret for this site — keep it out of source control. The middleware server
          uses it to pull pricing/policy from this dashboard and push transaction records here
          instead of only using its local config file.
        </p>
        <code className="code-block">{site.middlewareDeployKey}</code>
        <form action={regenerateDeployKey} style={{ marginTop: "0.75rem" }}>
          <input type="hidden" name="siteId" value={site.id} />
          <button type="submit" className="btn btn-outline">
            Regenerate deploy key
          </button>
          <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
            If this key has been shared anywhere it shouldn&apos;t have (a chat log, a public
            repo, a screenshot), regenerate it. The old key stops working immediately — update
            <code>CRAWLPAY_DASHBOARD_DEPLOY_KEY</code> wherever the middleware is deployed right
            after, or it starts failing to reach this dashboard.
          </p>
        </form>
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Configure the middleware</h2>
        <p style={{ marginBottom: "0.75rem" }}>
          Set these on wherever the CrawlPay middleware is deployed (e.g. Render):
        </p>
        <pre className="code-block" style={{ marginBottom: "0.75rem" }}>{`CRAWLPAY_DASHBOARD_URL=${dashboardUrl}
CRAWLPAY_DASHBOARD_DEPLOY_KEY=${site.middlewareDeployKey}`}</pre>
        <p className="muted">
          The middleware polls <code>GET /api/v1/config</code> here for pricing/policy and calls{" "}
          <code>POST /api/v1/transactions</code> after each verified payment, falling back to its
          local <code>publisher-config.json</code> if this dashboard is unreachable.
        </p>
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>WordPress plugin</h2>
        <p style={{ marginBottom: "0.75rem" }}>
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
