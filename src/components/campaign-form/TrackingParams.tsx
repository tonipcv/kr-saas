"use client";

import { useEffect } from 'react';

// Persist tracking params from the landing URL into a cookie for fallback capture on submit
// Cookie name: cxl_campaign_tracking
export default function TrackingParams() {
  useEffect(() => {
    try {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      if (!search) return;
      const p = new URLSearchParams(search);
      const data: Record<string, string> = {};
      const keys = [
        'referrerCode', 'ref',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
      ];
      let hasAny = false;
      for (const k of keys) {
        const v = p.get(k);
        if (v) {
          data[k] = v;
          hasAny = true;
        }
      }
      if (!hasAny) return;
      const payload = encodeURIComponent(JSON.stringify(data));
      const maxAge = 60 * 60 * 24 * 30; // 30 days
      document.cookie = `cxl_campaign_tracking=${payload}; path=/; max-age=${maxAge}`;
    } catch (_) {
      // ignore
    }
  }, []);
  return null;
}
