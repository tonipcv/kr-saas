"use client";

import { useState } from "react";

type QA = { q: string; a: string };

export default function FAQ({ items }: { items?: QA[] }) {
  const data: QA[] =
    items ?? [
      {
        q: "Is this a replacement for my loyalty tool?",
        a: "Yes. Zuzz lets you run referrals, points, and rewards codes in one place, with simple setup and clear attribution.",
      },
      {
        q: "How long does it take to get started?",
        a: "Most teams launch in under 1 hour. You can start with links and codes, then enable points when you're ready.",
      },
      {
        q: "Can I import existing customers and balances?",
        a: "Yes. You can import users, creators, and initial point balances via CSV or API.",
      },
      {
        q: "Do you support custom reward rules?",
        a: "You can define earning and redemption rules per action, with guardrails like caps, expiries, and minimums.",
      },
      {
        q: "What about pricing?",
        a: "Simple, usage‑based pricing. Start free, then scale as you grow.",
      },
    ];

  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-20 md:py-28 border-t border-gray-100" aria-labelledby="faq-title">
      <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-5 gap-10">
        {/* Left copy */}
        <div className="md:col-span-2">
          <h2 id="faq-title" className="text-2xl md:text-4xl font-extrabold text-gray-900">
            Frequently Asked <span className="text-gray-500">Questions</span>
          </h2>
          <p className="mt-3 text-sm md:text-base text-gray-600">
            Answers to common questions about referrals, points, and rewards codes. Need more help?
            <a href="#" className="ml-1 underline decoration-gray-300 hover:text-gray-900">Contact us</a>.
          </p>
        </div>

        {/* Right list */}
        <div className="md:col-span-3 space-y-3">
          {data.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="bg-white rounded-xl ring-1 ring-gray-200 shadow-sm">
                <button
                  className="w-full flex items-center justify-between text-left px-4 py-3 md:px-5 md:py-4"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-${i}`}
                >
                  <span className="text-sm md:text-base font-medium text-gray-900">{item.q}</span>
                  <span className="ml-4 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-700 text-sm">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <div id={`faq-${i}`} className="px-4 pb-4 md:px-5 md:pb-5 text-sm text-gray-600">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
