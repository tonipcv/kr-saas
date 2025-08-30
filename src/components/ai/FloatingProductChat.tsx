"use client";

import React, { useState } from "react";
import ProductQAWidget from "./ProductQAWidget";

export default function FloatingProductChat({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Launcher */}
      <button
        aria-label="Abrir chat de produtos"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center justify-center rounded-full h-14 w-14 bg-indigo-600 text-white shadow-xl hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200"
      >
        {open ? (
          // Close icon
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 11-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        ) : (
          // Chat icon
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M2.25 12c0-4.97 4.477-9 10-9s10 4.03 10 9-4.477 9-10 9c-1.252 0-2.451-.2-3.558-.572-.33-.111-.689-.085-.995.067L4.5 21.75l1.23-3.075c.112-.28.095-.596-.047-.861A8.055 8.055 0 0 1 2.25 12Z" />
          </svg>
        )}
      </button>

      {/* Panel */}
      <div
        className={
          "fixed bottom-20 right-4 z-40 w-[92vw] max-w-sm transition-all " +
          (open ? "opacity-100 translate-y-0" : "opacity-0 pointer-events-none translate-y-2")
        }
      >
        <ProductQAWidget slug={slug} />
      </div>
    </>
  );
}
