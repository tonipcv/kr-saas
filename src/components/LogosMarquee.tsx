"use client";

import Image from "next/image";

export default function LogosMarquee({ logos }: { logos: string[] }) {
  const row = [...logos, ...logos]; // duplicate for seamless loop
  return (
    <div className="relative overflow-hidden py-8 md:py-10 select-none">
      <div className="marquee flex items-center gap-1 sm:gap-2 md:gap-4 will-change-transform">
        {row.map((src, i) => (
          <div key={`${src}-${i}`} className="relative h-12 sm:h-14 md:h-20 w-36 sm:w-44 md:w-56 shrink-0">
            <Image
              src={src}
              alt="logo"
              fill
              className="object-contain filter brightness-0 opacity-80"
              sizes="(max-width: 640px) 160px, (max-width: 768px) 192px, 224px"
            />
          </div>
        ))}
      </div>
      <style jsx>{`
        .marquee {
          animation: marquee 35s linear infinite;
          width: max-content;
        }
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
