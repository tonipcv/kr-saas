import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isCronAuthorized(req: Request): boolean {
  const headers = new Headers(req.headers);
  if (headers.get("x-vercel-cron")) return true;
  const secret = process.env.WEBHOOKS_CRON_SECRET;
  return !!secret && headers.get("x-cron-secret") === secret;
}

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const maxAgeMs = Number(process.env.WEBHOOKS_STUCK_MAX_AGE_MS || 24 * 60 * 60 * 1000); // 24h

  const cutoff = new Date(now.getTime() - maxAgeMs);

  const [toFail, toReschedule] = await Promise.all([
    prisma.outboundWebhookDelivery.findMany({
      where: { status: "PENDING", attempts: { gte: 10 } },
      select: { id: true },
      take: 200,
    }),
    prisma.outboundWebhookDelivery.findMany({
      where: {
        status: "PENDING",
        attempts: { lt: 10 },
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { lt: cutoff } },
        ],
      },
      select: { id: true },
      take: 200,
    }),
  ]);

  if (toFail.length > 0) {
    await prisma.outboundWebhookDelivery.updateMany({
      where: { id: { in: toFail.map((d) => d.id) } },
      data: { status: "FAILED", nextAttemptAt: null },
    });
  }

  if (toReschedule.length > 0) {
    await prisma.outboundWebhookDelivery.updateMany({
      where: { id: { in: toReschedule.map((d) => d.id) } },
      data: { nextAttemptAt: now },
    });
  }

  return NextResponse.json({ failed: toFail.length, rescheduled: toReschedule.length });
}
