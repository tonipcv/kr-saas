"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "react-hot-toast";
import Link from "next/link";

interface MembershipLevel {
  id: string;
  name: string;
  slug?: string | null;
  minPoints: number;
  isActive: boolean;
  clinic_id: string;
  clinic?: {
    name: string;
    slug: string;
  };
}

export default function MembershipLevelsPage() {
  const [levels, setLevels] = useState<MembershipLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Partial<MembershipLevel>>({
    name: "",
    minPoints: 0,
    isActive: true,
  });

  const loadLevels = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/membership/levels');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar níveis");
      setLevels(data.levels || []);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao carregar níveis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadLevels();
  }, []);

  const createLevel = async () => {
    if (!form.name || form.name.trim().length === 0) {
      toast.error("Nome é obrigatório");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/membership/levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name?.trim(),
          minPoints: Number(form.minPoints) || 0,
          isActive: Boolean(form.isActive),
          slug: form.slug?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar nível");
      toast.success("Nível criado");
      setForm({ name: "", minPoints: 0, isActive: true, slug: "" });
      loadLevels();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao criar nível");
    } finally {
      setSaving(false);
    }
  };

  const updateLevel = async (id: string, patch: Partial<MembershipLevel>) => {
    try {
      const res = await fetch(`/api/membership/levels/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar nível");
      loadLevels();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao atualizar nível");
    }
  };

  const deleteLevel = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este nível?")) return;
    try {
      const res = await fetch(`/api/membership/levels/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir nível");
      toast.success("Nível excluído");
      loadLevels();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao excluir nível");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Membership Levels</h1>
              <p className="text-sm text-gray-500 mt-1">Defina regras de pontuação por nível (ex.: Bronze, Prata, Ouro)</p>
            </div>
            <Link href="/doctor/patients">
              <Button variant="outline" className="rounded-xl">Voltar</Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Níveis de Membership</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        className="w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white shadow-sm rounded-xl"
                      >
                        Adicionar Nível
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Novo Nível de Membership</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>Nome</Label>
                          <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Bronze" />
                        </div>
                        <div>
                          <Label>Slug (opcional)</Label>
                          <Input value={form.slug || ""} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="ex.: bronze" />
                        </div>
                        <div>
                          <Label>Pontos mínimos</Label>
                          <Input type="number" value={form.minPoints ?? 0} onChange={(e) => setForm({ ...form, minPoints: Number(e.target.value) })} />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Ativo</Label>
                          <Switch checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                        </div>
                        <Button
                          onClick={createLevel}
                          disabled={saving}
                          className="w-full bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white shadow-sm rounded-xl"
                        >
                          {saving ? "Salvando..." : "Criar Nível"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {loading ? (
                  <p className="text-sm text-gray-500">Carregando níveis...</p>
                ) : levels.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 mb-4">Nenhum nível cadastrado ainda</p>
                    <p className="text-sm text-gray-500">Clique em "Adicionar Nível" para começar</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <table className="min-w-full">
                      <thead className="bg-gray-50/80">
                        <tr className="text-left text-xs text-gray-600">
                          <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Nome</th>
                          <th className="px-3 py-3.5 font-medium">Slug</th>
                          <th className="px-3 py-3.5 font-medium">Min. pontos</th>
                          <th className="px-3 py-3.5 font-medium">Ativo</th>
                          <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {levels.sort((a,b)=>a.minPoints-b.minPoints).map((lvl) => (
                          <tr key={lvl.id} className="text-sm">
                            <td className="py-3.5 pl-4 pr-3 sm:pl-6">
                              <Input defaultValue={lvl.name} onBlur={(e)=>updateLevel(lvl.id,{ name: e.target.value })} />
                            </td>
                            <td className="px-3 py-3.5">
                              <Input defaultValue={lvl.slug || ""} onBlur={(e)=>updateLevel(lvl.id,{ slug: e.target.value || null })} />
                            </td>
                            <td className="px-3 py-3.5">
                              <Input type="number" defaultValue={lvl.minPoints} onBlur={(e)=>updateLevel(lvl.id,{ minPoints: Number(e.target.value)||0 })} />
                            </td>
                            <td className="px-3 py-3.5">
                              <div className="flex items-center">
                                <Switch checked={lvl.isActive} onCheckedChange={(v)=>updateLevel(lvl.id,{ isActive: v })} />
                              </div>
                            </td>
                            <td className="py-3.5 pl-3 pr-4 sm:pr-6 text-right">
                              <Button
                                className="mr-2 bg-gradient-to-r from-[#5893ec] to-[#9bcef7] hover:opacity-90 text-white shadow-sm rounded-xl"
                                onClick={()=>updateLevel(lvl.id,{})}
                                title="Salvar alterações"
                              >
                                Salvar
                              </Button>
                              <Button
                                variant="outline"
                                className="rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
                                onClick={()=>deleteLevel(lvl.id)}
                                title="Excluir nível"
                              >
                                Excluir
                              </Button>
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
      </div>
    </div>
  );
}