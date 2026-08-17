import { NextResponse } from "next/server";
import { z } from "zod";
import { siteForDeployKey } from "@/lib/deploy-key-auth";
import { prisma } from "@/lib/prisma";

const TransactionRequestSchema = z.object({
  url: z.string(),
  botClassification: z.string(),
  amount: z.string(),
  payer: z.string(),
  occurredAt: z.string().datetime().optional(),
});

/**
 * Called by the deployed middleware after each verified payment, in
 * addition to (not instead of) its own ConsoleTransactionLog/
 * PostgresTransactionLog -- this is what feeds the dashboard's revenue
 * chart and transaction table, so a failure here must never block the
 * response to the paying crawler (the middleware side already treats
 * transaction-log failures as non-fatal; this endpoint just needs to fail
 * loudly with a clear status so that non-fatal handling has something
 * useful to log).
 */
export async function POST(request: Request) {
  const site = await siteForDeployKey(request);
  if (!site) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = TransactionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  await prisma.transaction.create({
    data: {
      siteId: site.id,
      url: parsed.data.url,
      botClassification: parsed.data.botClassification,
      amount: parsed.data.amount,
      payer: parsed.data.payer,
      ...(parsed.data.occurredAt ? { occurredAt: new Date(parsed.data.occurredAt) } : {}),
    },
  });

  return NextResponse.json({ status: "ok" }, { status: 201 });
}
