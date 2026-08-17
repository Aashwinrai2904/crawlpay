import { notFound } from "next/navigation";
import { requirePublisher } from "@/lib/auth";
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
    <div style={{ display: "grid", gap: "2rem", maxWidth: 800 }}>
      <div>
        <h1>{site.domain}</h1>
        <p style={{ color: "#666" }}>Pricing &amp; policy</p>
      </div>

      <section>
        <h2>Policy</h2>
        <p style={{ color: "#666" }}>
          What happens to each kind of visitor. Only ai-crawler pricing rules below actually
          matter unless its policy is &quot;charge&quot;.
        </p>
        <form action={boundUpdatePolicy} style={{ display: "grid", gap: "0.5rem", maxWidth: 400 }}>
          {CLASSIFICATIONS.map((classification) => (
            <label
              key={classification}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              {classification}
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
            </label>
          ))}
          <button type="submit" style={{ marginTop: "0.5rem" }}>
            Save policy
          </button>
        </form>
      </section>

      <section>
        <h2>Pricing rules</h2>
        {site.pricingRules.length > 0 ? (
          <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "1rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                <th style={{ padding: "0.4rem 0" }}>Path</th>
                <th>Type</th>
                <th>Price</th>
                <th>Currency</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {site.pricingRules.map((rule) => (
                <tr key={rule.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.4rem 0" }}>{rule.pathPattern}</td>
                  <td>{rule.botClassification}</td>
                  <td>{(rule.priceCents / 100).toFixed(2)}¢</td>
                  <td>{rule.currency}</td>
                  <td>
                    <form action={deletePricingRule.bind(null, site.id, rule.id)}>
                      <button type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#666" }}>No pricing rules yet — requests fall back to the middleware&apos;s own default.</p>
        )}

        <h3>Add a rule</h3>
        <form
          action={boundUpsertPricingRule}
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
        >
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
          <button type="submit">Add</button>
        </form>
      </section>
    </div>
  );
}
