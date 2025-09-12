"use client";

import Image from "next/image";
import React from "react";

export type Testimonial = {
  quote: string;
  name: string;
  title: string;
  company: string;
  avatar: string;
  highlight?: boolean;
};

export default function TestimonialsCarousel({ items }: { items: Testimonial[] }) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  const scrollBy = (dir: "left" | "right") => () => {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = Math.round(el.clientWidth * 0.9);
    el.scrollBy({ left: dir === "left" ? -delta : delta, behavior: "smooth" });
  };

  return (
    <div className="relative">
      {/* Mobile: horizontal snap carousel */}
      <div className="md:hidden">
        <div
          ref={scrollerRef}
          className="mt-8 grid grid-flow-col auto-cols-[85%] gap-4 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-hide px-2"
        >
          {items.map((t, idx) => (
            <div key={idx} className="snap-center rounded-2xl bg-white ring-1 ring-gray-200 p-5 shadow-sm">
              <blockquote className="text-gray-900 text-base leading-relaxed">“{t.quote}”</blockquote>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-gray-200">
                  <Image src={t.avatar} alt={`${t.name} avatar`} width={36} height={36} className="h-full w-full object-cover" />
                </div>
                <div className="text-sm">
                  <div className="font-semibold text-gray-900">{t.name}</div>
                  <div className="text-gray-600">{t.title}, {t.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: simple 3-column grid, middle highlighted */}
      <div className="hidden md:grid md:grid-cols-3 gap-6 mt-12">
        {items.slice(0, 3).map((t, idx) => {
          const isCenter = idx === 1; // highlight the center card
          return (
            <div
              key={idx}
              className={`rounded-2xl bg-white ring-1 ring-gray-200 p-6 ${isCenter ? 'shadow-md' : 'opacity-70'} transition`}
            >
              <blockquote className={`${isCenter ? 'text-xl font-semibold' : 'text-lg'} text-gray-900 leading-relaxed`}>
                “{t.quote}”
              </blockquote>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-gray-200">
                  <Image src={t.avatar} alt={`${t.name} avatar`} width={36} height={36} className="h-full w-full object-cover" />
                </div>
                <div className="text-sm">
                  <div className="font-semibold text-gray-900">{t.name}</div>
                  <div className="text-gray-600">{t.title}, {t.company}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
