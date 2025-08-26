"use client";

import React from "react";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function StatCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-white/60 backdrop-blur p-5 shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-gray-900">{children}</h2>;
}

export default function LandingDashboardPage() {
  // Dados fictícios
  const faturamentoMes = 45890.35;
  const ticketMedio = 312.9;
  const novosPacientes = 62;
  const consultasHoje = 11;

  const proximasConsultas = [
    { hora: "08:45", paciente: "Mariana Azevedo", procedimento: "Consulta de rotina" },
    { hora: "10:00", paciente: "Pedro Almeida", procedimento: "Ajuste de protocolo" },
    { hora: "14:20", paciente: "Carla Nunes", procedimento: "Avaliação inicial" },
    { hora: "16:10", paciente: "Rafael Cunha", procedimento: "Retorno" },
  ];

  const topProtocolos = [
    { nome: "Emagrecimento 12 semanas", vendas: 41, receita: 22890.0 },
    { nome: "Sono e Performance", vendas: 26, receita: 9100.0 },
    { nome: "Controle de Ansiedade", vendas: 22, receita: 7480.0 },
  ];

  return (
    <div className="px-4 py-6 md:px-8 lg:px-10">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard (Preview Landing)</h1>
          <p className="text-sm text-gray-500">Dados fictícios para screenshots</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-lg border bg-white px-3 py-2 text-sm">Últimos 30 dias</button>
          <button className="rounded-lg bg-black text-white px-3 py-2 text-sm">Exportar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Faturamento (mês)" value={currency.format(faturamentoMes)} sub="+18% vs mês anterior" />
        <StatCard title="Ticket médio" value={currency.format(ticketMedio)} sub="+7%" />
        <StatCard title="Novos pacientes" value={`${novosPacientes}`} sub="+12 esta semana" />
        <StatCard title="Consultas hoje" value={`${consultasHoje}`} sub="3 em teleconsulta" />
      </div>

      {/* Conteúdo principal */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Gráfico (placeholder) */}
        <div className="lg:col-span-2 rounded-xl border bg-white/60 backdrop-blur p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle>Faturamento por dia (demo)</SectionTitle>
            <span className="text-xs text-gray-500">Gráfico ilustrativo</span>
          </div>
          {/* Placeholder de gráfico com barras */}
          <div className="mt-2 h-56 w-full">
            <div className="grid h-full w-full grid-cols-12 items-end gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex w-full items-end">
                  <div
                    className="w-full rounded-t bg-emerald-500"
                    style={{ height: `${35 + Math.abs(Math.cos(i)) * 55}%` }}
                    title={`Dia ${i + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Próximas consultas */}
        <div className="rounded-xl border bg-white/60 backdrop-blur p-5 shadow-sm">
          <SectionTitle>Próximas consultas</SectionTitle>
          <ul className="mt-4 space-y-3">
            {proximasConsultas.map((c, idx) => (
              <li key={idx} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-gray-900 truncate">{c.paciente}</span>
                  <span className="text-xs text-gray-500 truncate">{c.procedimento}</span>
                </div>
                <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{c.hora}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Tabela de protocolos mais vendidos */}
      <div className="mt-6 rounded-xl border bg-white/60 backdrop-blur p-5 shadow-sm">
        <SectionTitle>Protocolos mais vendidos</SectionTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2">Protocolo</th>
                <th className="px-3 py-2">Vendas</th>
                <th className="px-3 py-2">Receita</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topProtocolos.map((p, idx) => (
                <tr key={idx} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 text-gray-900">{p.nome}</td>
                  <td className="px-3 py-2 text-gray-700">{p.vendas}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{currency.format(p.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rodapé informativo */}
      <p className="mt-6 text-center text-xs text-gray-500">
        Esta página é apenas uma simulação com dados fictícios para fins de demonstração.
      </p>
    </div>
  );
}
