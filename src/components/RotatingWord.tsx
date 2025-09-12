"use client";

import React from "react";

export default function RotatingWord({
  words,
  intervalMs = 3800,
  className = "",
}: {
  words: string[];
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<"in" | "out">("in");

  React.useEffect(() => {
    const show = setInterval(() => {
      // fade out
      setPhase("out");
      // after fade out, change word and fade in
      const t = setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setPhase("in");
      }, 200);
      return () => clearTimeout(t);
    }, intervalMs);
    return () => clearInterval(show);
  }, [intervalMs, words.length]);

  return (
    <span
      className={`inline-flex items-baseline align-baseline transition-opacity duration-300 ${
        phase === "in" ? "opacity-100" : "opacity-0"
      } ${className}`}
      style={{ lineHeight: '1em', paddingBottom: '0.08em' }}
    >
      {words[index]}
    </span>
  );
}
