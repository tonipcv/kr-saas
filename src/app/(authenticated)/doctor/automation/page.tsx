"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  is_active: boolean;
  created_at: string;
}

export default function AutomationPage() {
  const [list, setList] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v2/doctor/automations", { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `HTTP ${res.status}`);
        setList([]);
        return;
      }
      setList(Array.isArray(json?.data) ? json.data : []);
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Close menu on outside click, scroll, or resize
  useEffect(() => {
    const close = () => { setMenuOpenId(null); setMenuPos(null); };
    const onClick = (e: MouseEvent) => {
      // If clicking on a menu item/button, let handlers close explicitly
      // Otherwise, close on any click
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('[data-kebab-menu]')) return;
      close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('click', onClick);
    };
  }, []);

  // Creation moved to dedicated page /doctor/automation/new

  const toggleAutomation = async (id: string) => {
    try {
      const res = await fetch(`/api/v2/doctor/automations/${encodeURIComponent(id)}/toggle`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || `HTTP ${res.status}`); return; }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado');
    }
  }

  const deleteAutomation = async (id: string) => {
    try {
      setDeletingId(id);
      const res = await fetch(`/api/v2/doctor/automations/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || `HTTP ${res.status}`); setDeletingId(null); return; }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Automation</h1>
              <p className="text-xs text-gray-500">Crie automações por trigger para executar ações automaticamente</p>
            </div>
            <div className="flex gap-2">
              <Link href="/doctor/automation/playbooks"><Button variant="outline" size="sm">Playbooks</Button></Link>
              <Link href="/doctor/automation/new"><Button size="sm" className="h-8 bg-gray-900 hover:bg-black text-white">Nova automação</Button></Link>
            </div>
          </div>

          {/* List */}
          <Card className="bg-white border border-gray-200 shadow-sm rounded-2xl">
            <CardHeader className="px-4 py-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-900">Minhas automações</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              {loading && <p className="text-sm text-gray-500">Carregando…</p>}
              {!loading && list.length === 0 && <p className="text-sm text-gray-500">Nenhuma automação criada.</p>}
              {list.length > 0 && (
                <div className="overflow-x-auto overflow-visible relative">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600">
                        <th className="py-2 pr-4">Nome</th>
                        <th className="py-2 pr-4">Trigger</th>
                        <th className="py-2 pr-4">Ação</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Criada em</th>
                        <th className="py-2 pr-4">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(a => (
                        <tr key={a.id} className="border-t border-gray-100 text-gray-800 relative">
                          <td className="py-2 pr-4">{a.name}</td>
                          <td className="py-2 pr-4">{a.trigger_type}</td>
                          <td className="py-2 pr-4">{a.action_type}</td>
                          <td className="py-2 pr-4">{a.is_active ? 'Ativa' : 'Pausada'}</td>
                          <td className="py-2 pr-4">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(a.created_at))}</td>
                          <td className="py-2 pr-4">
                            <div className="inline-block text-left" data-kebab-menu>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={(e) => {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const menuWidth = 160;
                                  const top = rect.bottom + 4 + window.scrollY;
                                  const left = rect.right - menuWidth + window.scrollX;
                                  setMenuPos({ top, left });
                                  setMenuOpenId(prev => prev === a.id ? null : a.id);
                                }}
                              >
                                ⋯
                              </Button>
                              {menuOpenId === a.id && menuPos && (
                                <div
                                  className="fixed z-50 w-40 origin-top-right rounded-md border border-gray-200 bg-white shadow-lg"
                                  style={{ top: menuPos.top, left: menuPos.left }}
                                  data-kebab-menu
                                >
                                  <div className="py-1 text-sm">
                                    <Link href={`/doctor/automation/${encodeURIComponent(a.id)}/edit`} className="block px-3 py-2 hover:bg-gray-50" onClick={() => { setMenuOpenId(null); setMenuPos(null); }}>Editar</Link>
                                    <button className="block w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => { setMenuOpenId(null); setMenuPos(null); toggleAutomation(a.id); }}>
                                      {a.is_active ? 'Pausar' : 'Ativar'}
                                    </button>
                                    <button className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50" onClick={() => { setMenuOpenId(null); setMenuPos(null); deleteAutomation(a.id); }} disabled={deletingId === a.id}>
                                      {deletingId === a.id ? 'Excluindo…' : 'Excluir'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Creation moved to dedicated page */}
    </div>
  );
}
