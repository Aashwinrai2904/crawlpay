import { notFound } from "next/navigation";
import { requirePublisher } from "@/lib/auth";
import { classificationPillClass } from "@/lib/classification-pill";
import { prisma } from "@/lib/prisma";
import { deletePricingRule, updatePolicy, upsertPricingRule } from "../actions";

const CLASSIFICATIONS = ["human", "search-crawler", "ai-crawler", "unknown-bot"] as const;
const POLICY_ACTIONS = ["allow", "charge", "block"] as const;

export default async function SitePricingPage({ params }: { params: { id: string } }) {
  const { publisher } = await requirePublisher();
  const site = await prisma.site.findFirst({
    where: { id: params.id, publisherId: publisher.id },
    include: { pricingRules: { orderBy: { updatedAt: "desc" } }, policyRules: true },
  });

  if (!site) {
    notFound();
  }

  const policyByClassification = new Map(site.policyRules.map((rule) => [rule.botClassification, rule]));
  const boundUpdatePolicy = updatePolicy.bind(null, site.id);
  const boundUpsertPricingRule = upsertPricingRule.bind(null, site.id);

  return (
    <div className="stack" style={{ maxWidth: 800 }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>{site.domain}</h1>
        <p className="muted">Pricing &amp; policy</p>
      </div>

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Policy</h2>
        <p className="muted" style={{ marginBottom: "1.25rem" }}>
          What happens to each kind of visitor. Only ai-crawler pricing rules below actually
          matter unless its policy is &quot;charge&quot;.
        </p>
        <form action={boundUpdatePolicy} className="stack" style={{ gap: "0.75rem", maxWidth: 420 }}>
          {CLASSIFICATIONS.map((classification) => (
            <div key={classification} className="field-row">
              <span className={`pill ${classificationPillClass(classification)}`}>{classification}</span>
              <select
                name={`policy-${classification}`}
                defaultValue={policyByClassification.get(classification)?.action ?? "allow"}
              >
                {POLICY_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button type="submit" className="btn btn-primary" style={{ marginTop: "0.5rem", alignSelf: "start" }}>
            Save policy
          </button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Pricing rules</h2>
        {site.pricingRules.length > 0 ? (
          <div style={{ overflowX: "auto", marginBottom: "1.5rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Currency</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {site.pricingRules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.pathPattern}</td>
                    <td>
                      <span className={`pill ${classificationPillClass(rule.botClassification)}`}>
                        {rule.botClassification}
                      </span>
                    </td>
                    <td>{(rule.priceCents / 100).toFixed(2)}¢</td>
                    <td>{rule.currency}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deletePricingRule.bind(null, site.id, rule.id)}>
                        <button type="submit" className="btn btn-danger-ghost">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No pricing rules yet — requests fall back to the middleware&apos;s own default.
          </p>
        )}

        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>Add a rule</h3>
        <form action={boundUpsertPricingRule} className="form-inline">
          <select name="botClassification" defaultValue="ai-crawler">
            {CLASSIFICATIONS.map((classification) => (
              <option key={classification} value={classification}>
                {classification}
              </option>
            ))}
          </select>
          <input type="text" name="pathPattern" placeholder="* (all paths)" defaultValue="*" style={{ width: 140 }} />
          <input
            type="number"
            name="priceCents"
            placeholder="Price (cents)"
            step="0.01"
            min="0"
            required
            style={{ width: 120 }}
          />
          <input type="text" name="currency" defaultValue="USDC" style={{ width: 80 }} />
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
