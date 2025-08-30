"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type ChatMessage = { role: "user" | "assistant"; content: string; createdAt: number };

export default function ProductQAWidget({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Olá! Posso responder dúvidas sobre os produtos desta clínica. Pergunte sobre categorias, indicações, valores ou diferenças entre serviços.",
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 1 && !loading, [input, loading]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    const question = input.trim();
    if (!question) return;
    setInput("");

    const next = [...messages, { role: "user" as const, content: question, createdAt: Date.now() }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/products/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      const answer = data?.answer || data?.error || "Não foi possível obter uma resposta agora.";
      setMessages((prev) => [...prev, { role: "assistant", content: answer, createdAt: Date.now() }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Ocorreu um erro ao processar sua pergunta.", createdAt: Date.now() },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }

  const suggestions = [
    "Quais produtos vocês têm?",
    "Qual a diferença entre dois tratamentos?",
    "Tem opções para pele sensível?",
    "Quanto custa e como agendar?",
  ];

  function handleSuggestionClick(text: string) {
    setInput("");
    const next = [...messages, { role: "user" as const, content: text, createdAt: Date.now() }];
    setMessages(next);
    setLoading(true);
    fetch(`/api/ai/products/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next }),
    })
      .then((r) => r.json())
      .then((data) => {
        const answer = data?.answer || data?.error || "Não foi possível obter uma resposta agora.";
        setMessages((prev) => [...prev, { role: "assistant", content: answer, createdAt: Date.now() }]);
      })
      .catch(() => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Ocorreu um erro ao processar sua pergunta.", createdAt: Date.now() },
        ]);
      })
      .finally(() => setLoading(false));
  }

  function formatTime(ts: number) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  return (
    <section className="mt-8">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-medium text-gray-800">Assistente de Produtos</h2>
          </div>
          <span className="text-[11px] text-gray-400">Beta</span>
        </div>

        {/* Quick suggestions */}
        <div className="px-5 pt-4 pb-0">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => handleSuggestionClick(s)}
                disabled={loading}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto px-5 py-4 space-y-4" id="qa-scroll" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={m.role === "user" ? "flex items-end gap-2" : "flex items-end gap-2 flex-row-reverse"}>
                {/* Bubble */}
                <div
                  className={
                    "inline-block max-w-[78%] px-4 py-2.5 rounded-2xl text-[0.9375rem] leading-relaxed break-words shadow-sm " +
                    (m.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-md"
                      : "bg-gray-100 text-gray-800 rounded-bl-md")
                  }
                >
                  <ReactMarkdown
                    components={{
                      p: ({ node, ...props }) => (
                        <p className="mb-2 last:mb-0 whitespace-pre-wrap" {...props} />
                      ),
                      strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc pl-5 space-y-1 mb-2" {...props} />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol className="list-decimal pl-5 space-y-1 mb-2" {...props} />
                      ),
                      li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
                      a: ({ node, ...props }) => (
                        <a className="text-indigo-200 underline break-all" target="_blank" rel="noreferrer" {...props} />
                      ),
                      img: ({ node, ...props }) => (
                        <img
                          className="mt-1 mb-2 rounded-lg border border-gray-200 max-h-40 w-auto object-cover"
                          alt={(props.alt as string) || "Imagem"}
                          {...props}
                        />
                      ),
                      h1: ({ node, ...props }) => <h1 className="text-base font-semibold mb-2" {...props} />,
                      h2: ({ node, ...props }) => <h2 className="text-base font-semibold mb-2" {...props} />,
                      h3: ({ node, ...props }) => <h3 className="text-base font-semibold mb-2" {...props} />,
                      h4: ({ node, ...props }) => <h4 className="text-base font-semibold mb-2" {...props} />,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                  {/* timestamp */}
                  <div className={"mt-1 text-[10px] " + (m.role === "user" ? "text-indigo-100" : "text-gray-500")}>{formatTime(m.createdAt)}</div>
                </div>
                {/* Avatar */}
                <div
                  className={
                    "h-7 w-7 rounded-full shrink-0 grid place-items-center text-[11px] font-medium border " +
                    (m.role === "user"
                      ? "bg-indigo-600 text-white border-indigo-500"
                      : "bg-white text-gray-700 border-gray-200")
                  }
                  title={m.role === "user" ? "Você" : "Assistente"}
                >
                  {m.role === "user" ? "Você" : "AI"}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm bg-gray-100 text-gray-600 shadow-sm">
                <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-.24s]" />
                <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-.12s]" />
                <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={onSend} className="border-t border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <input
              ref={inputRef}
              disabled={loading}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Faça uma pergunta sobre os produtos..."
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[0.95rem] leading-6 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3.5-3.5L12 0v4a8 8 0 000 16v4l3.5-3.5L12 20v4a8 8 0 01-8-8z"></path>
                  </svg>
                  <span>Enviando</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M11.7 2.3a1 1 0 0 1 1 0l8 4.5a1 1 0 0 1 0 1.8l-8 4.5a1 1 0 0 1-1.5-.9V12L4 8.9a1 1 0 0 1 0-1.8l7.7-4.3Z" /><path d="M20.7 10.3l-8 4.4a3 3 0 0 1-4.4-2.6V8.2L4 10.1v5.8a3 3 0 0 0 4.5 2.6l12.2-6.8a1 1 0 0 0 0-1.8Z" />
                  </svg>
                  <span>Enviar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
