import Link from "next/link";
import {
  setPolicyAction,
  upsertPricingRule,
  deletePricingRule,
} from "../../../../../lib/actions/pricing";
import { updatePublisherWallet, updateSiteParams } from "../../../../../lib/actions/sites";
import { requireSiteForPublisher } from "../../../../../lib/require-site";
import { prisma } from "../../../../../lib/prisma";
import {
  BOT_CLASSIFICATIONS,
  DEFAULT_POLICY,
  POLICY_ACTIONS,
} from "../../../../../lib/site-config";

export default async function PricingPage({ params }: { params: { id: string } }) {
  const { publisher, site } = await requireSiteForPublisher(params.id);

  const [policyRules, pricingRules] = await Promise.all([
    prisma.policyRule.findMany({ where: { siteId: site.id } }),
    prisma.pricingRule.findMany({ where: { siteId: site.id }, orderBy: { updatedAt: "desc" } }),
  ]);

  const policyByClassification = new Map(
    policyRules.map((rule) => [rule.botClassification, rule.action]),
  );

  return (
    <main className="page stack">
      <div className="row-between">
        <div>
          <h1>Pricing &amp; policy</h1>
          <p className="text-muted">{site.domain}</p>
        </div>
        <Link href={`/dashboard?site=${site.id}`} className="btn">
          Back to overview
        </Link>
      </div>

      <div className="card stack">
        <h2>Payout &amp; payment settings</h2>
        <p className="text-muted">
          The x402 network/asset/timeout are site-wide (not per rule) — same as a flat pricing model
          the middleware currently understands. Dynamic per-path/per-bot pricing is Phase 7.
        </p>
        <form action={updatePublisherWallet} className="form-grid">
          <input type="hidden" name="siteId" value={site.id} />
          <div style={{ gridColumn: "span 2" }}>
            <label htmlFor="walletAddress">Payout wallet address</label>
            <input
              id="walletAddress"
              name="walletAddress"
              defaultValue={publisher.walletAddress ?? ""}
              placeholder="0x..."
              style={{ width: "100%" }}
            />
          </div>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </form>
        <form action={updateSiteParams} className="form-grid">
          <input type="hidden" name="siteId" value={site.id} />
          <div>
            <label htmlFor="network">Network</label>
            <input id="network" name="network" defaultValue={site.network} />
          </div>
          <div>
            <label htmlFor="asset">Asset</label>
            <input id="asset" name="asset" defaultValue={site.asset} />
          </div>
          <div>
            <label htmlFor="maxTimeoutSeconds">Payment timeout (s)</label>
            <input
              id="maxTimeoutSeconds"
              name="maxTimeoutSeconds"
              type="number"
              min={1}
              defaultValue={site.maxTimeoutSeconds}
            />
          </div>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </form>
      </div>

      <div className="card stack">
        <h2>Policy</h2>
        <p className="text-muted">
          What happens to each kind of visitor. Only ai-crawler is charged by default.
        </p>
        <table>
          <thead>
            <tr>
              <th>Classification</th>
              <th>Action</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {BOT_CLASSIFICATIONS.map((classification) => (
              <tr key={classification}>
                <td className="mono">{classification}</td>
                <td colSpan={2}>
                  <form action={setPolicyAction} className="row">
                    <input type="hidden" name="siteId" value={site.id} />
                    <input type="hidden" name="botClassification" value={classification} />
                    <select
                      name="action"
                      defaultValue={
                        policyByClassification.get(classification) ?? DEFAULT_POLICY[classification]
                      }
                    >
                      {POLICY_ACTIONS.map((action) => (
                        <option key={action} value={action}>
                          {action}
                        </option>
                      ))}
                    </select>
                    <button type="submit">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <h2>Pricing rules</h2>
        <p className="text-muted">
          The <span className="mono">*</span> / <span className="mono">ai-crawler</span> rule is the
          site-wide default price. Other path patterns are saved here for future use but not yet
          enforced by the middleware.
        </p>
        {pricingRules.length === 0 ? (
          <p className="empty">No pricing rules yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Path pattern</th>
                <th>Bot</th>
                <th>Price</th>
                <th>Currency</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pricingRules.map((rule) => (
                <tr key={rule.id}>
                  <td className="mono">{rule.pathPattern}</td>
                  <td className="mono">{rule.botClassification}</td>
                  <td>${(rule.priceCents / 100).toFixed(2)}</td>
                  <td>{rule.currency.toUpperCase()}</td>
                  <td>{rule.updatedAt.toLocaleDateString()}</td>
                  <td>
                    <form action={deletePricingRule}>
                      <input type="hidden" name="siteId" value={site.id} />
                      <input type="hidden" name="id" value={rule.id} />
                      <button type="submit" className="btn-danger">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3>Add / update a rule</h3>
        <form action={upsertPricingRule} className="form-grid">
          <input type="hidden" name="siteId" value={site.id} />
          <div>
            <label htmlFor="pathPattern">Path pattern</label>
            <input
              id="pathPattern"
              name="pathPattern"
              defaultValue="*"
              placeholder="* or /articles/*"
            />
          </div>
          <div>
            <label htmlFor="botClassification">Bot classification</label>
            <select id="botClassification" name="botClassification" defaultValue="ai-crawler">
              {BOT_CLASSIFICATIONS.map((classification) => (
                <option key={classification} value={classification}>
                  {classification}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="priceDollars">Price (USD)</label>
            <input
              id="priceDollars"
              name="priceDollars"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0.01"
            />
          </div>
          <div>
            <label htmlFor="currency">Currency</label>
            <input id="currency" name="currency" defaultValue="usd" />
          </div>
          <button type="submit" className="btn-primary">
            Save rule
          </button>
        </form>
      </div>
    </main>
  );
}
