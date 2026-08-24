import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeDeployKey } from "../../../../../../lib/internal-auth";
import { prisma } from "../../../../../../lib/prisma";
import { BOT_CLASSIFICATIONS } from "../../../../../../lib/site-config";

const TransactionPayloadSchema = z.object({
  timestamp: z.string().datetime().optional(),
  url: z.string(),
  botClassification: z.enum(BOT_CLASSIFICATIONS),
  amount: z.string(),
  payer: z.string(),
});

/**
 * Called by packages/middleware/src/transactions/http-transaction-log.ts
 * (HttpTransactionLog) in place of console.log-only recording. This is the
 * only thing that writes to the dashboard's Transaction table -- the
 * middleware never talks to Postgres directly for this data.
 */
export async function POST(request: NextRequest, { params }: { params: { siteId: string } }) {
  const site = await prisma.site.findUnique({ where: { id: params.siteId } });
  if (!site) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!authorizeDeployKey(request, site.middlewareDeployKey)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = TransactionPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const { timestamp, url, botClassification, amount, payer } = parsed.data;
  await prisma.transaction.create({
    data: {
      siteId: site.id,
      url,
      botClassification,
      amount,
      payer,
      ...(timestamp ? { occurredAt: new Date(timestamp) } : {}),
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
