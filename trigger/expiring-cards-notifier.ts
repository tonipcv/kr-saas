import { schedules } from "@trigger.dev/sdk/v3";
import { getPrisma } from "./prisma";

export const expiringCardsNotifier = schedules.task({
  id: "expiring-cards-notifier",
  cron: {
    pattern: "0 10 * * 1", // Segunda-feira 10:00
    timezone: "America/Sao_Paulo",
  },
  run: async () => {
    const prisma = await getPrisma();
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1; // 1-12
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextMonthYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    console.log("[NOTIFIER] Checking expiring cards", {
      currentYear,
      currentMonth,
      nextMonth,
      nextMonthYear,
    });

    const expiringSoon = await prisma.customerPaymentMethod.findMany({
      where: {
        status: "ACTIVE" as any,
        isDefault: true,
        OR: [
          { expYear: currentYear, expMonth: currentMonth },
          { expYear: nextMonthYear, expMonth: nextMonth },
        ],
      },
      include: { customer: true },
      take: 500,
      orderBy: { updatedAt: "desc" },
    });

    let planned = 0;
    for (const method of expiringSoon) {
      const email = (method as any).customer?.email || "unknown";
      const name = (method as any).customer?.name || "";

      // No email sender available in the repo; log intent for observability.
      console.log("[NOTIFIER] Would send email", {
        to: email,
        name,
        brand: method.brand,
        last4: method.last4,
        expMonth: method.expMonth,
        expYear: method.expYear,
        updateUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/billing/cards`,
      });
      planned++;
    }

    console.log(`[NOTIFIER] Expiring cards planned notifications: ${planned}/${expiringSoon.length}`);

    return { total: expiringSoon.length, planned };
  },
});
