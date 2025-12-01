import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signPayload } from "@/lib/webhooks/signature";

export async function POST(req: Request) {
  try {
    const { deliveryId } = await req.json();
    if (!deliveryId || typeof deliveryId !== "string") {
      return NextResponse.json({ error: "deliveryId is required" }, { status: 400 });
    }

    const delivery = await prisma.outboundWebhookDelivery.findFirst({
      where: { id: deliveryId },
      include: { endpoint: true, event: true },
    });

    if (!delivery) return NextResponse.json({ error: "delivery not found" }, { status: 404 });

    if (delivery.status === "DELIVERED") {
      return NextResponse.json({ status: "already_delivered", deliveryId });
    }

    if (!delivery.endpoint.url.startsWith("https://")) {
      await prisma.outboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "FAILED",
          lastError: "Endpoint URL must use HTTPS for security",
          attempts: (delivery.attempts || 0) + 1,
          nextAttemptAt: null,
        },
      });
      return NextResponse.json({ error: "https required" }, { status: 400 });
    }

    const payload = {
      specVersion: "1.0",
      id: delivery.event.id,
      type: delivery.event.type,
      createdAt: delivery.event.createdAt.toISOString(),
      attempt: (delivery.attempts || 0) + 1,
      idempotencyKey: delivery.event.id,
      clinicId: delivery.event.clinicId,
      resource: delivery.event.resource,
      data: delivery.event.payload,
    };

    const body = JSON.stringify(payload);
    const size = Buffer.byteLength(body, "utf8");
    const MAX = 1024 * 1024;
    if (size > MAX) {
      await prisma.outboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "FAILED",
          lastError: `Payload too large: ${size} bytes (max: 1MB)`,
          attempts: (delivery.attempts || 0) + 1,
          nextAttemptAt: null,
        },
      });
      return NextResponse.json({ error: "payload too large" }, { status: 400 });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(delivery.endpoint.secret, body, timestamp);

    const start = Date.now();
    let ok = false;
    let statusCode = 0;
    let errorMsg: string | null = null;

    try {
      const resp = await fetch(delivery.endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Id": delivery.event.id,
          "X-Webhook-Event": delivery.event.type,
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": String(timestamp),
          "X-Webhook-Spec-Version": "1.0",
          "User-Agent": "KrxScale-Webhooks/1.0 (Vercel)",
        },
        body,
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(15000) : undefined,
      });
      statusCode = resp.status;
      ok = resp.ok;
      if (!ok) errorMsg = `HTTP ${resp.status}: ${(await resp.text()).slice(0, 500)}`;
    } catch (e: any) {
      ok = false;
      errorMsg = e?.message || String(e);
    }

    const latency = Date.now() - start;

    if (ok) {
      await prisma.outboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          attempts: (delivery.attempts || 0) + 1,
          lastCode: statusCode,
          lastError: null,
          nextAttemptAt: null,
        },
      });
      return NextResponse.json({ status: "delivered", deliveryId, latency, statusCode });
    }

    // backoff policy: 1m, 5m, 15m, 1h, 6h, 24h, 48h, 72h, 96h
    const attempt = (delivery.attempts || 0) + 1;
    const backoffs = [60, 300, 900, 3600, 21600, 86400, 172800, 259200, 345600];
    const nextDelaySec = backoffs[Math.min(attempt - 1, backoffs.length - 1)];

    await prisma.outboundWebhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: attempt >= 10 ? "FAILED" : "PENDING",
        attempts: attempt,
        lastCode: statusCode || null,
        lastError: errorMsg?.slice(0, 1000) || null,
        nextAttemptAt: attempt >= 10 ? null : new Date(Date.now() + nextDelaySec * 1000),
      },
    });

    return NextResponse.json({ status: "pending", deliveryId, attempt, latency, error: errorMsg }, { status: 202 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
