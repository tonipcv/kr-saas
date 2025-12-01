'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useClinic } from '@/contexts/clinic-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Endpoint = {
  id: string
  clinicId: string
  name: string
  url: string
  events: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
  stats?: {
    totalDeliveries: number
    successRate: number
    lastDeliveryAt?: string
  }
}

export default function WebhooksPage() {
  const { currentClinic } = useClinic()
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createUrl, setCreateUrl] = useState('')
  // Details modal state
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null)
  const [deliveries, setDeliveries] = useState<Array<{
    id: string
    status: string
    attempts: number | null
    lastCode: number | null
    lastError: string | null
    deliveredAt: string | null
    createdAt: string
    event: { type: string; createdAt: string }
  }>>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  // Predefined outbound transaction events (provider-agnostic)
  // Derived from PaymentStatus enum in prisma/schema.prisma + 'created'
  const AVAILABLE_EVENTS = [
    'payment.transaction.created',
    'payment.transaction.pending',
    'payment.transaction.processing',
    'payment.transaction.requires_action',
    'payment.transaction.succeeded',
    'payment.transaction.failed',
    'payment.transaction.canceled',
    'payment.transaction.expired',
    'payment.transaction.refunding',
    'payment.transaction.refunded',
    'payment.transaction.partially_refunded',
    'payment.transaction.chargeback',
    'payment.transaction.disputed',
  ] as const
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    'payment.transaction.created',
    'payment.transaction.succeeded',
  ])
  // New fields for advanced config
  const [maxConcurrentDeliveries, setMaxConcurrentDeliveries] = useState<number>(5)
  const [categoryFilter, setCategoryFilter] = useState<'all'|'marketplaces'|'products'>('all')
  // product selection
  const [productOptions, setProductOptions] = useState<{ id: string; name: string }[]>([])
  const [productOptionsLoading, setProductOptionsLoading] = useState(false)
  const [productFilters, setProductFilters] = useState<string[]>([])
  const [createEnabled, setCreateEnabled] = useState(true)
  const [creating, setCreating] = useState(false)

  const loadEndpoints = async () => {
    if (!currentClinic?.id) return
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch(`/api/webhooks/endpoints?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Failed to load endpoints')
      }
      const js = await res.json()
      const list = Array.isArray(js?.endpoints) ? js.endpoints : []
      setEndpoints(list)
    } catch (e: any) {
      setError(e?.message || 'Failed to load endpoints')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadEndpoints() }, [currentClinic?.id])

  // Load deliveries for selected endpoint
  useEffect(() => {
    const fetchDeliveries = async () => {
      if (!currentClinic?.id || !selectedEndpoint?.id) return
      try {
        setDeliveriesLoading(true)
        const u = new URL('/api/webhooks/deliveries', window.location.origin)
        u.searchParams.set('clinicId', currentClinic.id)
        u.searchParams.set('endpointId', selectedEndpoint.id)
        u.searchParams.set('limit', '50')
        const res = await fetch(u.toString(), { cache: 'no-store' })
        if (!res.ok) throw new Error('Falha ao carregar entregas')
        const js = await res.json()
        setDeliveries(Array.isArray(js?.deliveries) ? js.deliveries : [])
      } catch (e) {
        setDeliveries([])
      } finally {
        setDeliveriesLoading(false)
      }
    }
    fetchDeliveries()
  }, [selectedEndpoint?.id, currentClinic?.id])

  // Load products when modal is open and user wants to filter by products
  useEffect(() => {
    const loadProducts = async () => {
      if (!isCreateOpen || categoryFilter !== 'products' || !currentClinic?.id) return
      try {
        setProductOptionsLoading(true)
        const res = await fetch(`/api/products?clinicId=${encodeURIComponent(currentClinic.id)}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Falha ao carregar produtos')
        const list = await res.json()
        const mapped = Array.isArray(list) ? list.map((p: any) => ({ id: p.id, name: p.name })) : []
        setProductOptions(mapped)
      } catch (e) {
        setProductOptions([])
      } finally {
        setProductOptionsLoading(false)
      }
    }
    loadProducts()
  }, [isCreateOpen, categoryFilter, currentClinic?.id])

  const submitCreate = async () => {
    if (!currentClinic?.id) return
    const events = selectedEvents
    if (createName.trim().length < 6 || !/^https:\/\//i.test(createUrl) || events.length === 0) {
      alert('Preencha nome, URL https:// e ao menos um evento')
      return
    }
    try {
      setCreating(true)
      const res = await fetch('/api/webhooks/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: currentClinic.id,
          name: createName.trim(),
          url: createUrl.trim(),
          events,
          enabled: createEnabled,
          maxConcurrentDeliveries,
          categoryFilter,
          productFilters: categoryFilter === 'products' ? productFilters : [],
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Falha ao criar endpoint')
      }
      setIsCreateOpen(false)
      setCreateName('')
      setCreateUrl('')
      setSelectedEvents(['payment.transaction.created', 'payment.transaction.succeeded'])
      setMaxConcurrentDeliveries(5)
      setCategoryFilter('all')
      setProductFilters([])
      setCreateEnabled(true)
      await loadEndpoints()
    } catch (e: any) {
      alert(e?.message || 'Erro ao criar endpoint')
    } finally {
      setCreating(false)
    }
  }

  const rotateSecret = async (id: string) => {
    const ok = confirm('Rotacionar o secret deste endpoint?')
    if (!ok) return
    try {
      const res = await fetch(`/api/webhooks/endpoints/${id}/rotate-secret`, { method: 'POST' })
      if (!res.ok) throw new Error('Falha ao rotacionar secret')
      await loadEndpoints()
      alert('Secret rotacionado com sucesso.')
    } catch (e: any) {
      alert(e?.message || 'Erro ao rotacionar secret')
    }
  }

  const deleteEndpoint = async (id: string) => {
    const ok = confirm('Excluir este endpoint?')
    if (!ok) return
    try {
      const res = await fetch(`/api/webhooks/endpoints/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Falha ao excluir endpoint')
      await loadEndpoints()
    } catch (e: any) {
      alert(e?.message || 'Erro ao excluir endpoint')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24">
          {/* Header - match products page header style */}
          <div className="mb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-[20px] font-semibold text-gray-900 tracking-[-0.01em]">Webhooks</h1>
                <p className="text-sm text-gray-500 mt-1">Configure endpoints e acompanhe entregas</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-8 bg-gray-900 hover:bg-black text-white shadow-sm rounded-xl" onClick={() => setIsCreateOpen(true)}>
                  Novo Endpoint
                </Button>
                <Button asChild size="sm" className="h-8 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl">
                  <Link href="#" onClick={(e) => { e.preventDefault(); alert('Modal de teste pendente (API /api/webhooks/test pronta).'); }}>
                    Enviar Teste
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">Carregando...</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-4">{error}</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white/70 backdrop-blur-sm shadow-sm">
              <table className="min-w-full">
                <thead className="bg-gray-50/80">
                  <tr className="text-left text-xs text-gray-600">
                    <th className="py-3.5 pl-4 pr-3 font-medium sm:pl-6">Nome</th>
                    <th className="px-3 py-3.5 font-medium">URL</th>
                    <th className="px-3 py-3.5 font-medium">Eventos</th>
                    <th className="px-3 py-3.5 font-medium">Status</th>
                    <th className="px-3 py-3.5 font-medium">Estatísticas</th>
                    <th className="py-3.5 pl-3 pr-4 sm:pr-6 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {endpoints.map((ep) => (
                    <tr
                      key={ep.id}
                      className="hover:bg-gray-50/60 cursor-pointer"
                      onClick={() => setSelectedEndpoint(ep)}
                    >
                      <td className="whitespace-nowrap py-3.5 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{ep.name}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-700">{ep.url}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-700">{ep.events.length}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                        {ep.enabled ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">Ativo</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">Inativo</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-sm text-gray-700">
                        {ep.stats ? (
                          <span>
                            {ep.stats.totalDeliveries} envios • Sucesso {(Math.round((ep.stats.successRate || 0) * 10000) / 100)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="relative whitespace-nowrap py-3.5 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-gray-700 hover:bg-gray-50"
                            onClick={(e) => { e.stopPropagation(); rotateSecret(ep.id) }}
                          >Rotar secret</Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-gray-700 hover:bg-gray-50"
                            onClick={(e) => { e.stopPropagation(); deleteEndpoint(ep.id) }}
                          >Excluir</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogContent className="max-w-xl bg-white border border-gray-200 rounded-2xl p-6">
              <DialogHeader>
                <DialogTitle className="text-[18px] font-semibold text-gray-900">Novo Endpoint</DialogTitle>
                <DialogDescription>Crie um endpoint para receber eventos de transação</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Nome</label>
                  <input value={createName} onChange={(e) => setCreateName(e.target.value)} className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  {createName && createName.trim().length < 6 && (
                    <p className="mt-1 text-xs text-red-600">O nome deve ter no mínimo 6 caracteres</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">URL (https://)</label>
                  <input value={createUrl} onChange={(e) => setCreateUrl(e.target.value)} placeholder="https://example.com/webhooks" className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Envios simultâneos</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={1} max={15} value={maxConcurrentDeliveries} onChange={(e) => setMaxConcurrentDeliveries(Number(e.target.value))} className="flex-1" />
                    <input type="number" min={1} max={15} value={maxConcurrentDeliveries} onChange={(e) => setMaxConcurrentDeliveries(Math.max(1, Math.min(15, Number(e.target.value) || 1)))} className="w-16 h-9 rounded-lg border border-gray-200 bg-white px-2 text-[13px] text-gray-900 shadow-sm focus:outline-none" />
                  </div>
                </div>
                {/* Status UI removed for now */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Filtrar por</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-800">
                      <input type="radio" name="categoryFilter" value="all" checked={categoryFilter==='all'} onChange={() => { setCategoryFilter('all'); setProductFilters([]) }} />
                      <span>Todos</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-800">
                      <input type="radio" name="categoryFilter" value="products" checked={categoryFilter==='products'} onChange={() => setCategoryFilter('products')} />
                      <span>Produtos</span>
                    </label>
                  </div>
                  {categoryFilter === 'products' && (
                    <div className="mt-3">
                      <label className="block text-sm text-gray-700 mb-2">Selecionar produtos</label>
                      <div className="max-h-48 overflow-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                        {productOptionsLoading ? (
                          <div className="px-3 py-2 text-sm text-gray-500">Carregando produtos...</div>
                        ) : productOptions.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">Nenhum produto encontrado</div>
                        ) : (
                          productOptions.map((opt) => {
                            const checked = productFilters.includes(opt.id)
                            return (
                              <label key={opt.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={(e) => {
                                    setProductFilters((prev) => e.target.checked ? Array.from(new Set([...prev, opt.id])) : prev.filter((x) => x !== opt.id))
                                  }}
                                />
                                <span>{opt.name}</span>
                              </label>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Eventos</label>
                  <div className="max-h-40 overflow-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {AVAILABLE_EVENTS.map((evt) => {
                      const checked = selectedEvents.includes(evt)
                      return (
                        <label key={evt} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedEvents((prev) => {
                                if (e.target.checked) return Array.from(new Set([...prev, evt]))
                                return prev.filter((x) => x !== evt)
                              })
                            }}
                          />
                          <span>{evt}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">Selecione ao menos um evento</p>
                <div className="flex items-center gap-2">
                  <input id="enabled" type="checkbox" checked={createEnabled} onChange={(e) => setCreateEnabled(e.target.checked)} className="h-4 w-4" />
                  <label htmlFor="enabled" className="text-sm text-gray-700">Ativo</label>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="outline" className="h-8" onClick={() => setIsCreateOpen(false)} disabled={creating}>Cancelar</Button>
                  <Button className="h-8 bg-gray-900 text-white" onClick={submitCreate} disabled={creating || !currentClinic?.id}>{creating ? 'Salvando...' : 'Salvar'}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Details Dialog */}
          <Dialog open={!!selectedEndpoint} onOpenChange={(open) => { if (!open) setSelectedEndpoint(null) }}>
            <DialogContent className="w-full max-w-[90vw] sm:max-w-5xl bg-white border border-gray-200 rounded-2xl p-6 max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-[18px] font-semibold text-gray-900">Entregas do Endpoint</DialogTitle>
                <DialogDescription>
                  {selectedEndpoint ? (
                    <div className="text-sm text-gray-600">
                      <div className="font-medium text-gray-900">{selectedEndpoint.name}</div>
                      <div className="truncate">{selectedEndpoint.url}</div>
                    </div>
                  ) : null}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-2 overflow-x-auto">
                {deliveriesLoading ? (
                  <div className="rounded-xl border border-gray-200 p-3 text-sm text-gray-600">Carregando entregas...</div>
                ) : deliveries.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 p-3 text-sm text-gray-600">Nenhuma entrega encontrada</div>
                ) : (
                  <div className="rounded-xl border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-xs text-gray-600">
                          <th className="py-2 px-3">ID</th>
                          <th className="py-2 px-3">Evento</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">Tentativas</th>
                          <th className="py-2 px-3">Código</th>
                          <th className="py-2 px-3">Criado</th>
                          <th className="py-2 px-3">Entregue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {deliveries.map((d) => (
                          <tr key={d.id} className="hover:bg-gray-50">
                            <td className="py-2 px-3 font-mono text-[12px] truncate max-w-[220px]" title={d.id}>{d.id}</td>
                            <td className="py-2 px-3">{d.event?.type || '-'}</td>
                            <td className="py-2 px-3">{d.status}</td>
                            <td className="py-2 px-3">{d.attempts ?? 0}</td>
                            <td className="py-2 px-3">{d.lastCode ?? '-'}</td>
                            <td className="py-2 px-3">{new Date(d.createdAt).toLocaleString()}</td>
                            <td className="py-2 px-3">{d.deliveredAt ? new Date(d.deliveredAt).toLocaleString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
