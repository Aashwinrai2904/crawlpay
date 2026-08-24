import Link from "next/link";
import { CopyButton } from "../../../../../components/copy-button";
import { regenerateDeployKey } from "../../../../../lib/actions/sites";
import { getDashboardBaseUrl } from "../../../../../lib/dashboard-url";
import { requireSiteForPublisher } from "../../../../../lib/require-site";

export default async function SetupPage({ params }: { params: { id: string } }) {
  const { site } = await requireSiteForPublisher(params.id);
  const dashboardUrl = getDashboardBaseUrl();

  const envBlock = [
    `CRAWLPAY_DASHBOARD_URL=${dashboardUrl}`,
    `CRAWLPAY_SITE_ID=${site.id}`,
    `CRAWLPAY_DEPLOY_KEY=${site.middlewareDeployKey}`,
  ].join("\n");

  return (
    <main className="page stack">
      <div className="row-between">
        <div>
          <h1>Setup</h1>
          <p className="text-muted">{site.domain}</p>
        </div>
        <Link href={`/dashboard?site=${site.id}`} className="btn">
          Back to overview
        </Link>
      </div>

      <div className="card stack">
        <h2>Middleware deploy key</h2>
        <p className="text-muted">
          Authenticates this site&apos;s CrawlPay middleware to the dashboard&apos;s internal API
          (pulling pricing/policy, pushing transaction records). Not a login credential — never put
          it in client-side code.
        </p>
        <div className="copy-box">
          <span>{site.middlewareDeployKey}</span>
          <CopyButton value={site.middlewareDeployKey} />
        </div>
        <form action={regenerateDeployKey}>
          <input type="hidden" name="siteId" value={site.id} />
          <button type="submit" className="btn-danger">
            Regenerate key
          </button>
          <span className="text-muted" style={{ marginLeft: 8 }}>
            Invalidates the key above — update the middleware&apos;s env vars afterward.
          </span>
        </form>
      </div>

      <div className="card stack">
        <h2>1. Point the middleware at this dashboard</h2>
        <p className="text-muted">
          Set these on the CrawlPay middleware&apos;s (Phase 4) deployment. Once set, it polls{" "}
          <span className="mono">GET /api/internal/sites/{"{siteId}"}/config</span> for
          pricing/policy instead of its local <span className="mono">publisher-config.json</span>,
          and pushes paid requests to{" "}
          <span className="mono">POST /api/internal/sites/{"{siteId}"}/transactions</span> instead
          of only logging them. If this dashboard is ever unreachable, the middleware falls back to
          the last config it fetched, then to its local JSON file — a dashboard outage never takes
          the site down.
        </p>
        <pre className="code-block">{envBlock}</pre>
      </div>

      <div className="card stack">
        <h2>2. Choose a WordPress plugin mode</h2>
        <p className="text-muted">
          The rest of this is the Phase 5 WordPress plugin setup (see{" "}
          <span className="mono">packages/wp-plugin/README.md</span>) — unchanged by the dashboard.
          Its <em>Middleware URL</em> and <em>Site key</em> fields are a separate concern from the
          deploy key above: that pair authorizes WordPress to call the middleware directly (its{" "}
          <span className="mono">CRAWLPAY_SITE_KEY</span> env var), not the dashboard.
        </p>

        <div className="stack">
          <h3>Mode A — reverse proxy (recommended)</h3>
          <ol>
            <li>
              Point your DNS/server config at the middleware so it fronts every request to{" "}
              {site.domain}.
            </li>
            <li>
              In WordPress, go to <strong>Settings &gt; CrawlPay</strong> and select{" "}
              <strong>Mode A</strong>.
            </li>
            <li>
              Set <strong>Middleware URL</strong> to the middleware&apos;s public URL and{" "}
              <strong>Site key</strong> to its <span className="mono">CRAWLPAY_SITE_KEY</span>{" "}
              value.
            </li>
          </ol>
          <p className="text-muted">
            The middleware now handles every request end-to-end using the pricing/policy configured
            on this dashboard&apos;s Pricing page.
          </p>
        </div>

        <div className="stack">
          <h3>Mode B — shared hosting fallback</h3>
          <ol>
            <li>Install and activate the CrawlPay plugin (default mode on activation).</li>
            <li>
              In <strong>Settings &gt; CrawlPay</strong>, set <strong>Middleware URL</strong> and{" "}
              <strong>Site key</strong> as above, and leave Mode set to <strong>Mode B</strong>.
            </li>
            <li>
              Mirror the pricing/policy from this dashboard&apos;s Pricing page into the
              plugin&apos;s own Pricing/Policy sections — Mode B classifies by User-Agent alone and
              calls the middleware&apos;s <span className="mono">/verify-and-price</span>{" "}
              synchronously, so it needs its own copy of the site&apos;s default price.
            </li>
          </ol>
          <p className="text-muted">
            Use this only if you can&apos;t reconfigure a reverse proxy — it can&apos;t verify Web
            Bot Auth signatures the way Mode A can.
          </p>
        </div>
      </div>
    </main>
  );
}
