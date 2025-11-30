import {
  prisma
} from "../../chunk-Z52AI326.mjs";
import {
  schedules_exports
} from "../../chunk-ZVCL2B46.mjs";
import "../../chunk-RA6RHLTU.mjs";
import {
  __name,
  init_esm
} from "../../chunk-NKKWNCEX.mjs";

// trigger/expiring-cards-notifier.ts
init_esm();
var expiringCardsNotifier = schedules_exports.task({
  id: "expiring-cards-notifier",
  cron: {
    pattern: "0 10 * * 1",
    // Segunda-feira 10:00
    timezone: "America/Sao_Paulo"
  },
  run: /* @__PURE__ */ __name(async () => {
    const now = /* @__PURE__ */ new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextMonthYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    console.log("[NOTIFIER] Checking expiring cards", {
      currentYear,
      currentMonth,
      nextMonth,
      nextMonthYear
    });
    const expiringSoon = await prisma.customerPaymentMethod.findMany({
      where: {
        status: "ACTIVE",
        isDefault: true,
        OR: [
          { expYear: currentYear, expMonth: currentMonth },
          { expYear: nextMonthYear, expMonth: nextMonth }
        ]
      },
      include: { customer: true },
      take: 500,
      orderBy: { updatedAt: "desc" }
    });
    let planned = 0;
    for (const method of expiringSoon) {
      const email = method.customer?.email || "unknown";
      const name = method.customer?.name || "";
      console.log("[NOTIFIER] Would send email", {
        to: email,
        name,
        brand: method.brand,
        last4: method.last4,
        expMonth: method.expMonth,
        expYear: method.expYear,
        updateUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/billing/cards`
      });
      planned++;
    }
    console.log(`[NOTIFIER] Expiring cards planned notifications: ${planned}/${expiringSoon.length}`);
    return { total: expiringSoon.length, planned };
  }, "run")
});
export {
  expiringCardsNotifier
};
//# sourceMappingURL=expiring-cards-notifier.mjs.map
