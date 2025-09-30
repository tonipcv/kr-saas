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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

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

const slugify = (value: string) => {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    // Remove combining diacritical marks (ES5-compatible)
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

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
          slug: slugify(form.name || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar nível");
      toast.success("Nível criado");
      setForm({ name: "", minPoints: 0, isActive: true });
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
              <h1 className="text-[18px] font-semibold text-gray-900 tracking-[-0.01em]">Membership</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/doctor/patients">
                <Button className="h-7 px-2 text-xs rounded-md bg-black text-white hover:bg-black/80 border border-black">Voltar</Button>
              </Link>
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="h-7 px-2 text-xs rounded-md bg-black text-white hover:bg-black/80">Adicionar</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo nível</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div>
                      <Label>Nome</Label>
                      <Input className="h-8" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Bronze" />
                    </div>
                    <div>
                      <Label>Pontos mínimos</Label>
                      <Input className="h-8" type="number" value={form.minPoints ?? 0} onChange={(e) => setForm({ ...form, minPoints: Number(e.target.value) })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Ativo</Label>
                      <Switch className="data-[state=checked]:bg-black" checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                    </div>
                    <Button
                      onClick={createLevel}
                      disabled={saving}
                      className="w-full h-8 rounded-md bg-black text-white hover:bg-black/80"
                    >
                      {saving ? "Salvando..." : "Criar"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Níveis</CardTitle>
              </CardHeader>
              <CardContent>

                {loading ? (
                  <p className="text-sm text-gray-500">Carregando...</p>
                ) : levels.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-500">Nenhum nível.</div>
                ) : (
                  <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                    <table className="min-w-full">
                      <thead className="bg-gray-50/80">
                        <tr className="text-left text-xs text-gray-600">
                          <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Nome</th>
                          <th className="px-3 py-3.5 font-medium">Min. pontos</th>
                          <th className="px-3 py-3.5 font-medium">Ativo</th>
                          <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {levels.sort((a,b)=>a.minPoints-b.minPoints).map((lvl) => (
                          <tr key={lvl.id} className="text-sm">
                            <td className="py-3.5 pl-4 pr-3 sm:pl-6">
                              <Input className="h-8" defaultValue={lvl.name} onBlur={(e)=>updateLevel(lvl.id,{ name: e.target.value, slug: slugify(e.target.value) })} />
                            </td>
                            <td className="px-3 py-3.5">
                              <Input className="h-8" type="number" defaultValue={lvl.minPoints} onBlur={(e)=>updateLevel(lvl.id,{ minPoints: Number(e.target.value)||0 })} />
                            </td>
                            <td className="px-3 py-3.5">
                              <div className="flex items-center">
                                <Switch className="data-[state=checked]:bg-black" checked={lvl.isActive} onCheckedChange={(v)=>updateLevel(lvl.id,{ isActive: v })} />
                              </div>
                            </td>
                            <td className="py-3.5 pl-3 pr-4 sm:pr-6 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button className="h-7 w-7 p-0 rounded-md bg-black text-white hover:bg-black/80 inline-flex items-center justify-center">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={()=>updateLevel(lvl.id,{})} className="cursor-pointer">Salvar</DropdownMenuItem>
                                  <DropdownMenuItem onClick={()=>deleteLevel(lvl.id)} className="cursor-pointer text-red-600">Excluir</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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