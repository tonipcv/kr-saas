"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  orderId: string;
};

export default function StatusClient({ orderId }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const triedRef = useRef<number>(0);
  const reloadedRef = useRef<boolean>(false);

  useEffect(() => {
    let stop = false;
    async function poll() {
      const attempt = triedRef.current + 1;
      triedRef.current = attempt;
      try {
        const res = await fetch(`/api/checkout/status?id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const js = await res.json().catch(() => ({} as any));
        const norm = js?.normalized || null;
        const st = (norm?.status || js?.payment_status || js?.order_status || "").toString().toLowerCase();
        const amt = typeof norm?.amount_minor === "number" ? norm.amount_minor : null;
        const cur = typeof norm?.currency === "string" ? norm.currency : null;
        if (!stop) {
          setStatus(st || null);
          if (amt != null) setAmountMinor(amt);
          if (cur) setCurrency(cur);
        }
        // Terminal states: stop polling
        const terminal = st === "succeeded" || st === "paid" || st === "authorized" || st === "captured";
        if (terminal) {
          return; // do not schedule next poll
        }
        // If we have solid in-progress data (e.g., processing/requires_capture), trigger a single reload
        const good = (st && (st === "requires_capture" || st === "processing")) && (amt != null) && !!cur;
        if (good && !reloadedRef.current) {
          reloadedRef.current = true;
          // Avoid infinite loops for this order id
          try { sessionStorage.setItem(`success_refreshed_${orderId}`, "1"); } catch {}
          // Reload to let server component re-render with the latest DB data
          setTimeout(() => { if (!stop) window.location.replace(window.location.href); }, 200);
          return;
        }
      } catch {}
      // backoff: 1000ms, 1500ms, 2000ms, max 4000ms
      const d = Math.min(1000 + (attempt - 1) * 500, 4000);
      if (!stop && attempt < 40) setTimeout(poll, d); // up to ~2 minutes worst case
    }
    // If we already reloaded once for this order, keep polling but do not reload again
    try { if (sessionStorage.getItem(`success_refreshed_${orderId}`) === "1") reloadedRef.current = true; } catch {}
    poll();
    return () => { stop = true; };
  }, [orderId]);

  // Show only a subtle spinner while processing; no extra text to avoid duplication with header
  if (!status) return null;
  const terminal = status === 'succeeded' || status === 'paid' || status === 'authorized' || status === 'captured';
  if (terminal) return null;
  return (
    <div className="flex items-center justify-center mt-3">
      <div className="h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" aria-label="loading" />
    </div>
  );
}
