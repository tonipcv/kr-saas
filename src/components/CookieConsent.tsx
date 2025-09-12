"use client";

import React from "react";

type Props = {
  locale: "en" | "pt";
  country?: string;
};

const texts = {
  en: {
    message:
      "We use cookies to improve your experience, save your preferences (like language), and analyze usage.",
    accept: "Accept",
    learnMore: "Learn more",
  },
  pt: {
    message:
      "Usamos cookies para melhorar sua experiência, salvar suas preferências (como idioma) e analisar o uso.",
    accept: "Aceitar",
    learnMore: "Saiba mais",
  },
};

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax`;
}

export default function CookieConsent({ locale, country }: Props) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const consent = getCookie("cookie_consent");
    if (consent === "true") {
      // If already consented, ensure country and optional URL lang are persisted
      if (country) setCookie("country", country);
      try {
        const params = new URLSearchParams(window.location.search);
        const lang = (params.get("lang") || "").toLowerCase();
        if (lang === "pt" || lang === "pt-br") setCookie("lang", "pt");
        if (lang === "en") setCookie("lang", "en");
      } catch {}
      setVisible(false);
    } else {
      setVisible(true);
    }
  }, []);

  const t = texts[locale] ?? texts.en;

  const onAccept = () => {
    setCookie("cookie_consent", "true");
    // Set helpful preferences when consent is granted
    setCookie("lang", locale);
    if (country) setCookie("country", country);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4">
      <div className="mx-auto max-w-3xl rounded-lg bg-white/95 backdrop-blur border border-gray-200 shadow-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm text-gray-700 flex-1">{t.message}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={onAccept}
            className="px-4 py-2 rounded-md text-white text-sm font-semibold bg-gradient-to-r from-[#1d2b64] to-[#2b5876] hover:from-[#192455] hover:to-[#244861]"
          >
            {t.accept}
          </button>
          {/* Optionally link to a privacy page */}
          {/* <a href="/privacy" className="text-sm text-gray-700 underline">{t.learnMore}</a> */}
        </div>
      </div>
    </div>
  );
}
