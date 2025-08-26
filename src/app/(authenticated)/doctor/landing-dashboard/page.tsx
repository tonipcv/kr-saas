'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  UsersIcon,
  DocumentTextIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import ProjectionLineChart, { SeriesPoint } from '@/components/charts/ProjectionLineChart';

interface Patient {
  id: string;
  name?: string;
  email?: string;
}

export default function LandingDashboardDemo() {
  const router = useRouter();

  // Dados estáticos/fictícios
  const stats = {
    revenueCollected: 12890,
    referralsCount: 54,
    usersCount: 216,
  };

  const rewardsSummary = { configured: 4, pending: 7, redeemed: 15 };

  const patients: Patient[] = [
    { id: 'p1', name: 'Maria Souza', email: 'maria@example.com' },
    { id: 'p2', name: 'João Lima', email: 'joao@example.com' },
    { id: 'p3', name: 'Ana Pereira', email: 'ana@example.com' },
    { id: 'p4', name: 'Carlos Santos', email: 'carlos@example.com' },
    { id: 'p5', name: 'Beatriz Nunes', email: 'bia@example.com' },
  ];

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(amount || 0);

  const getPatientInitials = (name?: string) => {
    if (!name) return 'C';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Mesmo gráfico/projeção do dashboard real, porém com dados estáticos
  const today = new Date();
  const daysAgo = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n).getTime();
  const base: number[] = [0, 30, 0, 0, 360, 180, 0, 0, 210, 0, 0, 0, 1080, 170, 0, 0, 0, 980, 820, 0, 0, 0, 300, 0, 0, 0, 820, 0, 0, 60];
  const pastSeries: SeriesPoint[] = base.map((v, idx) => [daysAgo(base.length - 1 - idx), v]);

  return (
    <div className="min-h-screen bg-white">
      {/* Mantém spacing para a sidebar do layout autenticado */}
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          {/* Header */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between">
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Overview</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/doctor/patients/smart-add')}
                  className="inline-flex h-8 items-center rounded-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] px-3 text-xs font-medium text-white hover:opacity-90 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5893ec]"
                >
                  New client
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-2">
            {[
              {
                title: 'Revenue collected',
                value: formatCurrency(stats.revenueCollected),
                note: 'total',
              },
              { title: 'Referrals', value: stats.referralsCount, note: 'last 30 days' },
              { title: 'Users', value: stats.usersCount, note: 'total' },
            ].map((kpi) => (
              <div key={String(kpi.title)} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">{kpi.title}</span>
                  <span className="text-[10px] text-gray-400">{kpi.note}</span>
                </div>
                <div className="mt-1 text-[22px] leading-7 font-semibold text-gray-900">{kpi.value as any}</div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            {/* Rewards */}
            <Card className="bg-white border border-gray-200 rounded-2xl col-span-2 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
                <CardTitle className="text-sm font-semibold text-gray-900">Rewards</CardTitle>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800">
                    <Link href="/doctor/rewards">Manage Rewards</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800">
                    <Link href="/doctor/rewards/approvals">Approvals</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Configured', value: rewardsSummary.configured },
                    { label: 'Pending', value: rewardsSummary.pending },
                    { label: 'Redeemed', value: rewardsSummary.redeemed },
                  ].map((m) => (
                    <div key={m.label} className="px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 shadow-sm">
                      <p className="text-[11px] text-gray-600 font-medium">{m.label}</p>
                      <p className="text-[22px] leading-7 font-semibold text-gray-900">{m.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Projections chart */}
            <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl col-span-2">
              <CardContent className="p-0">
                <ProjectionLineChart title="Referral projections" past={pastSeries} height={320} />
              </CardContent>
            </Card>

            {/* Active Clients */}
            <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
                <CardTitle className="text-sm font-semibold text-gray-900">Active Clients</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-8 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full font-medium"
                >
                  <Link href="/doctor/patients">View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-0">
                <div className="divide-y divide-gray-200">
                  {patients.slice(0, 5).map((patient) => (
                    <div key={patient.id} className="flex items-center justify-between py-3 px-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] font-semibold text-gray-600">
                          {getPatientInitials(patient.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{patient.name || 'No name'}</p>
                          <p className="text-xs text-gray-500 truncate">{patient.email}</p>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-full text-xs">
                          <Link href={`/doctor/patients/${patient.id}`}>View</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Track Progress */}
            <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
                <CardTitle className="text-sm font-semibold text-gray-900">Track Progress</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-xs text-gray-600 mb-3">Monitor KPIs and review clients.</p>
                <div className="flex gap-3">
                  <Button asChild variant="outline" className="h-8 border-gray-300 text-gray-800 rounded-full text-xs font-medium px-3">
                    <Link href="/doctor/referrals/kpis">View KPIs</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-8 border-gray-300 text-gray-800 rounded-full text-xs font-medium px-3">
                    <Link href="/doctor/patients">View Clients</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Public link (fake) */}
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-gray-500 font-medium">Your public link</p>
                <code className="block text-sm text-gray-900 truncate">https://app.exemplo.com/dr-mendes</code>
              </div>
              <Button variant="outline" size="sm" className="h-8 border-gray-300 text-gray-800 shrink-0">
                Copy
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
