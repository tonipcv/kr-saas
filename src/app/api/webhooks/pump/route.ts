import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isCronAuthorized(req: Request): boolean {
  const headers = new Headers(req.headers);
  if (headers.get("x-vercel-cron")) return true; // Vercel Cron
  const secret = process.env.WEBHOOKS_CRON_SECRET;
  return !!secret && headers.get("x-cron-secret") === secret;
}

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const limit = Number(process.env.WEBHOOKS_PUMP_LIMIT || 25);

  // Find due deliveries
  const due = await prisma.outboundWebhookDelivery.findMany({
    where: {
      status: "PENDING",
      OR: [
        { nextAttemptAt: null },
        { nextAttemptAt: { lte: now } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  if (due.length === 0) return NextResponse.json({ picked: 0, triggered: 0 });

  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) return NextResponse.json({ error: "APP_BASE_URL not set" }, { status: 500 });

  const url = `${baseUrl.replace(/\/$/, "")}/api/webhooks/deliver`;

  const results = await Promise.allSettled(
    due.map((d) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId: d.id }),
      })
    )
  );

  const ok = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ picked: due.length, triggered: ok });
}
