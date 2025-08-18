"use client";

import React from "react";

// Referrals timeline — static, numbered, professional
// Usage: <ReferralStepper />
export default function ReferralStepper() {
  const steps = [
    { id: 1, title: "Invite & share", desc: "Creators or customers get a unique link to invite new users." },
    { id: 2, title: "Join & attribute", desc: "Signups via the link are automatically attributed." },
    { id: 3, title: "Conversion rules", desc: "Define what counts: signup, purchase, or custom events." },
    { id: 4, title: "Issue rewards", desc: "Reward referrers and referees with points, discounts, or codes." },
    { id: 5, title: "Track performance", desc: "See invites, conversions, and payouts in real time." },
  ];

  return (
    <section className="py-20 border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center">
          <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900">Referrals, step by step</h3>
          <p className="mt-2 text-gray-600 max-w-2xl mx-auto">Build a complete referrals flow — minimal setup.</p>
        </div>

        {/* Mobile: vertical list */}
        <div className="mt-8 md:hidden">
          <ol className="relative border-l border-gray-200 pl-4 space-y-6">
            {steps.map((s) => (
              <li key={s.id} className="ml-2">
                <div className="absolute -left-2.5 mt-1 h-5 w-5 rounded-full bg-white ring-1 ring-gray-200 text-[11px] font-semibold text-gray-900 flex items-center justify-center">
                  {s.id}
                </div>
                <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                <p className="mt-1 text-sm text-gray-600">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Desktop: horizontal timeline */}
        <div className="mt-10 hidden md:block">
          <div className="relative">
            <div className="absolute left-0 right-0 top-5 h-px bg-gray-200" />
            <div className="relative grid grid-cols-5 gap-6">
              {steps.map((s) => (
                <div key={s.id} className="relative">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 h-10 w-10 rounded-full bg-white ring-1 ring-gray-200 flex items-center justify-center text-sm font-semibold text-gray-900">
                      {s.id}
                    </div>
                    <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                  </div>
                  <p className="mt-2 text-sm text-gray-600 pr-2">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
