"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AppItem = {
  id: string;
  clinicId: string;
  type: "INDIVIDUAL" | "COMPANY";
  status: "DRAFT" | "PENDING_DOCUMENTS" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  businessName?: string | null;
  fullName?: string | null;
  documentNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  clinic?: { id: string; name: string | null; ownerId: string };
};

type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  accessGranted: boolean;
};

export default function MerchantApplicationsAdminPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const [items, setItems] = useState<AppItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);

  const [status, setStatus] = useState<string>(search.get("status") || "");
  const [type, setType] = useState<string>(search.get("type") || "");
  const [from, setFrom] = useState<string>(search.get("from") || "");
  const [to, setTo] = useState<string>(search.get("to") || "");

  const query = useMemo(() => {
    const q = new URLSearchParams();
    const effStatus = status && status !== 'ALL' ? status : '';
    const effType = type && type !== 'ALL' ? type : '';
    if (effStatus) q.set("status", effStatus);
    if (effType) q.set("type", effType);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    q.set("take", "50");
    q.set("skip", "0");
    return q.toString();
  }, [status, type, from, to]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [appsRes, usersRes] = await Promise.all([
        fetch(`/api/admin/merchant-applications?${query}`, { cache: "no-store" }),
        fetch(`/api/admin/users`, { cache: "no-store" })
      ]);
      if (!appsRes.ok) throw new Error(`List failed: ${appsRes.status}`);
      const apps = await appsRes.json();
      setItems(apps.items || []);
      setTotal(apps.total || 0);

      if (usersRes.ok) {
        const js = await usersRes.json();
        setUsers(js.users || []);
        setTotalUsers(js.total || 0);
      }
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function setUserAccess(id: string, desired: boolean) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/users/${id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessGranted: desired })
      });
      if (!res.ok) throw new Error(`Update access failed: ${res.status}`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Erro ao atualizar acesso');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) load();
  }, [session, query]);

  async function approve(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/merchant-applications/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(`Approve failed: ${res.status}`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao aprovar");
    } finally {
      setLoading(false);
    }
  }

  async function reject(id: string) {
    const notes = window.prompt("Motivo da rejeição:") || undefined;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/merchant-applications/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNotes: notes })
      });
      if (!res.ok) throw new Error(`Reject failed: ${res.status}`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao rejeitar");
    } finally {
      setLoading(false);
    }
  }

  function statusBadge(s: AppItem["status"]) {
    const map: Record<string, string> = {
      APPROVED: "bg-green-100 text-green-800",
      UNDER_REVIEW: "bg-blue-100 text-blue-800",
      PENDING_DOCUMENTS: "bg-yellow-100 text-yellow-800",
      REJECTED: "bg-red-100 text-red-800",
      DRAFT: "bg-gray-100 text-gray-700",
    };
    return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${map[s] || "bg-gray-100 text-gray-700"}`}>{s}</span>;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-[22px] font-semibold text-gray-900">Merchant Applications</h1>
            <div className="text-sm text-gray-600">{total} registros</div>
          </div>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="DRAFT">DRAFT</SelectItem>
                    <SelectItem value="PENDING_DOCUMENTS">PENDING_DOCUMENTS</SelectItem>
                    <SelectItem value="UNDER_REVIEW">UNDER_REVIEW</SelectItem>
                    <SelectItem value="APPROVED">APPROVED</SelectItem>
                    <SelectItem value="REJECTED">REJECTED</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="INDIVIDUAL">INDIVIDUAL</SelectItem>
                    <SelectItem value="COMPANY">COMPANY</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                <Button variant="outline" onClick={() => load()}>Aplicar</Button>
              </div>
            </CardContent>
          </Card>

          {/* Users with access status */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Users ({totalUsers})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2 pr-4">Access</th>
                      <th className="py-2 pr-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-t border-gray-100">
                        <td className="py-2 pr-4">{u.name || '-'}</td>
                        <td className="py-2 pr-4">{u.email || '-'}</td>
                        <td className="py-2 pr-4">{u.role}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${u.accessGranted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {u.accessGranted ? 'APPROVED' : 'PENDING'}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex gap-2">
                            {!u.accessGranted ? (
                              <Button size="sm" disabled={loading} onClick={() => setUserAccess(u.id, true)}>Aprovar</Button>
                            ) : (
                              <Button size="sm" variant="outline" disabled={loading} onClick={() => setUserAccess(u.id, false)}>Revogar</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {users.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-8">Nenhum usuário encontrado</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resultados</CardTitle>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-3 text-sm text-red-600">{error}</div>
              )}
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-4">Clinic</th>
                      <th className="py-2 pr-4">Tipo</th>
                      <th className="py-2 pr-4">Documento</th>
                      <th className="py-2 pr-4">Contato</th>
                      <th className="py-2 pr-4">Criado</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t border-gray-100">
                        <td className="py-2 pr-4">
                          <div className="font-medium text-gray-900">{it.clinic?.name || it.clinicId}</div>
                          <div className="text-[11px] text-gray-500">{it.id}</div>
                        </td>
                        <td className="py-2 pr-4">{it.type}</td>
                        <td className="py-2 pr-4">{it.documentNumber || "-"}</td>
                        <td className="py-2 pr-4">
                          <div>{it.email || "-"}</div>
                          <div className="text-[11px] text-gray-500">{it.phone || "-"}</div>
                        </td>
                        <td className="py-2 pr-4">{new Date(it.createdAt).toLocaleString()}</td>
                        <td className="py-2 pr-4">{statusBadge(it.status)}</td>
                        <td className="py-2 pr-4">
                          <div className="flex gap-2">
                            <Button size="sm" disabled={loading || it.status === "APPROVED"} onClick={() => approve(it.id)}>Aprovar</Button>
                            <Button size="sm" variant="outline" disabled={loading || it.status === "APPROVED"} onClick={() => reject(it.id)}>Rejeitar</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {items.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-8">Nenhuma aplicação encontrada</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
