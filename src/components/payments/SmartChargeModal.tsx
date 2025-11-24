'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Loader2, CreditCard, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface SavedCard {
  id: string
  provider: string
  providerPaymentMethodId: string
  providerCustomerId?: string
  brand?: string
  last4?: string
  expMonth?: number
  expYear?: number
  isDefault: boolean
  status: string
}

interface OfferWithPrices {
  id: string
  name: string
  description?: string
  priceCents: number
  currency: string
  maxInstallments?: number
  isSubscription: boolean
  countries: string[]
  providers: string[]
  pricesByCountry: Record<string, Array<{
    provider: string
    currency: string
    amountCents: number
  }>>
  paymentMethods: string[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: { id: string; name?: string | null; email?: string | null; phone?: string | null }
  clinicId?: string
  clinicSlug?: string
}

export default function SmartChargeModal({ open, onOpenChange, client, clinicId, clinicSlug }: Props) {
  const router = useRouter()
  
  // Estado
  const [loadingClinics, setLoadingClinics] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingOffers, setLoadingOffers] = useState(false)
  const [loadingCards, setLoadingCards] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  const [clinics, setClinics] = useState<Array<{ id: string; name: string; slug?: string }>>([])
  const [selectedClinicId, setSelectedClinicId] = useState<string>(clinicId || '')
  const [slug, setSlug] = useState<string>(clinicSlug || '')
  
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([])
  const [productId, setProductId] = useState<string>('')
  
  const [offers, setOffers] = useState<OfferWithPrices[]>([])
  const [selectedOfferId, setSelectedOfferId] = useState<string>('')
  
  const [country, setCountry] = useState<string>('BR')
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  
  const [installments, setInstallments] = useState<number>(1)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Oferta selecionada
  const selectedOffer = useMemo(() => 
    offers.find(o => o.id === selectedOfferId),
    [offers, selectedOfferId]
  )

  // Preços disponíveis para o país selecionado
  const availablePricesForCountry = useMemo(() => {
    if (!selectedOffer || !country) return []
    return selectedOffer.pricesByCountry[country] || []
  }, [selectedOffer, country])

  // Providers disponíveis para o país selecionado
  const availableProviders = useMemo(() => {
    return Array.from(new Set(availablePricesForCountry.map(p => p.provider)))
  }, [availablePricesForCountry])

  // Cartões salvos compatíveis (filtrados por provider disponível)
  const normalizeProvider = (p?: string) => {
    const v = String(p || '').toUpperCase()
    // KRXPAY e PAGARME são o mesmo gateway (Pagarme é interno, KRXPAY é público)
    if (v === 'PAGARME') return 'KRXPAY'
    return v
  }

  // Exibir nome amigável do provider para o usuário
  const displayProviderName = (p?: string) => {
    const v = String(p || '').toUpperCase()
    if (v === 'KRXPAY' || v === 'PAGARME') return 'KRX Pay'
    if (v === 'STRIPE') return 'Stripe'
    if (v === 'APPMAX') return 'Appmax'
    return v
  }

  const compatibleCards = useMemo(() => {
    if (availableProviders.length === 0) return []
    const normalizedAvailable = new Set(availableProviders.map(normalizeProvider))
    return savedCards.filter(card => 
      normalizedAvailable.has(normalizeProvider(card.provider)) && card.status === 'ACTIVE'
    )
  }, [savedCards, availableProviders])

  // Preço final baseado no cartão selecionado
  const finalPrice = useMemo(() => {
    if (!selectedOffer || !country) return null
    
    const selectedCard = savedCards.find(c => c.id === selectedCardId)
    if (!selectedCard) {
      // Sem cartão selecionado, pegar primeiro preço disponível
      return availablePricesForCountry[0] || null
    }
    
    // Buscar preço específico para o provider do cartão
    const wanted = normalizeProvider(selectedCard.provider)
    let priceForProvider = availablePricesForCountry.find(p => normalizeProvider(p.provider) === wanted)
    // Fallback: primeiro preço do país
    return priceForProvider || availablePricesForCountry[0] || null
  }, [selectedOffer, country, selectedCardId, savedCards, availablePricesForCountry])

  // Validação
  const isValid = useMemo(() => {
    return !!(
      slug &&
      productId &&
      selectedOfferId &&
      country &&
      selectedCardId &&
      finalPrice &&
      client.email &&
      client.name
    )
  }, [slug, productId, selectedOfferId, country, selectedCardId, finalPrice, client])

  // Carregar clínicas
  useEffect(() => {
    if (!open) return
    const load = async () => {
      setLoadingClinics(true)
      try {
        const res = await fetch('/api/clinics')
        const json = await res.json().catch(() => ({}))
        const list = Array.isArray(json?.clinics) ? json.clinics : []
        setClinics(list.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })))
        
        if (!selectedClinicId && list.length > 0) {
          const first = list[0]
          setSelectedClinicId(first.id)
          setSlug(first.slug || '')
        }
      } finally {
        setLoadingClinics(false)
      }
    }
    load()
  }, [open])

  // Carregar produtos
  useEffect(() => {
    if (!open || !selectedClinicId) return
    const load = async () => {
      setLoadingProducts(true)
      try {
        const res = await fetch(`/api/products?clinicId=${encodeURIComponent(selectedClinicId)}`)
        const json = await res.json().catch(() => [])
        const list = Array.isArray(json) ? json : []
        setProducts(list.map((p: any) => ({ id: p.id, name: p.name })))
        if (list.length > 0) setProductId(list[0].id)
      } finally {
        setLoadingProducts(false)
      }
    }
    load()
  }, [open, selectedClinicId])

  // Carregar ofertas com preços
  useEffect(() => {
    if (!open || !productId) return
    const load = async () => {
      setLoadingOffers(true)
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(productId)}/offers-with-prices`)
        const json = await res.json().catch(() => ({}))
        if (json.ok && Array.isArray(json.offers)) {
          setOffers(json.offers)
          if (json.offers.length > 0) {
            setSelectedOfferId(json.offers[0].id)
          }
        }
      } finally {
        setLoadingOffers(false)
      }
    }
    load()
  }, [open, productId])

  // Carregar cartões salvos
  useEffect(() => {
    if (!open || !slug || !client.id) return
    const load = async () => {
      setLoadingCards(true)
      try {
        const res = await fetch(`/api/payments/saved-cards?userId=${encodeURIComponent(client.id)}&slug=${encodeURIComponent(slug)}`)
        const json = await res.json().catch(() => ({}))
        if (json.ok && Array.isArray(json.data)) {
          setSavedCards(json.data.map((c: any) => ({
            id: c.id,
            provider: c.provider,
            providerPaymentMethodId: c.provider_payment_method_id,
            providerCustomerId: c.provider_customer_id,
            brand: c.brand,
            last4: c.last4,
            expMonth: c.exp_month,
            expYear: c.exp_year,
            isDefault: c.is_default,
            status: c.status
          })))
        }
      } finally {
        setLoadingCards(false)
      }
    }
    load()
  }, [open, slug, client.id])

  // Auto-selecionar cartão compatível
  useEffect(() => {
    if (compatibleCards.length > 0 && !selectedCardId) {
      const defaultCard = compatibleCards.find(c => c.isDefault) || compatibleCards[0]
      setSelectedCardId(defaultCard.id)
    } else if (compatibleCards.length === 0) {
      setSelectedCardId('')
    }
  }, [compatibleCards])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || !finalPrice) return

    setSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const selectedCard = savedCards.find(c => c.id === selectedCardId)
      if (!selectedCard) throw new Error('Cartão não encontrado')

      // Determine effective provider for this charge (prefer price provider match; fallback to card provider)
      const wantedProvider = normalizeProvider(finalPrice?.provider || selectedCard.provider)

      if (wantedProvider === 'APPMAX') {
        // AppMax flow: send tokenized card to /api/checkout/appmax/create
        const appmaxPayload: any = {
          productId,
          slug,
          method: 'card',
          installments,
          amountCents: finalPrice?.amountCents,
          token: selectedCard.providerPaymentMethodId, // tok_xxx salvo
          buyer: {
            name: client.name,
            email: client.email,
            phone: client.phone,
            address_street: '',
            address_city: '',
            address_state: '',
            postcode: '',
          }
        }
        const res = await fetch('/api/checkout/appmax/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appmaxPayload)
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Erro ao processar cobrança (AppMax)')
        setResult(json)
        toast.success('Cobrança criada com sucesso!')
        setTimeout(() => { onOpenChange(false); router.refresh() }, 2000)
        return
      }

      // Default flow (KRX Pay / Stripe etc.)
      const payload = {
        productId,
        slug,
        offerId: selectedOfferId,
        buyer: {
          name: client.name,
          email: client.email,
          phone: client.phone,
          address: { country }
        },
        payment: {
          method: 'card',
          installments,
          saved_card_id: selectedCard.providerPaymentMethodId,
          provider_customer_id: selectedCard.providerCustomerId || ''
        }
      }

      const res = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const json = await res.json()
      
      if (!res.ok) {
        throw new Error(json?.error || 'Erro ao processar cobrança')
      }

      setResult(json)
      toast.success('Cobrança criada com sucesso!')
      
      setTimeout(() => {
        onOpenChange(false)
        router.refresh()
      }, 2000)
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado')
      toast.error(e?.message || 'Erro ao processar cobrança')
    } finally {
      setSubmitting(false)
    }
  }

  const formatMoney = (cents: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: currency || 'BRL' 
    }).format(cents / 100)
  }

  const formatCard = (card: SavedCard) => {
    const brand = card.brand?.toUpperCase() || card.provider
    const last4 = card.last4 || '****'
    const exp = card.expMonth && card.expYear ? `${String(card.expMonth).padStart(2, '0')}/${card.expYear}` : ''
    return `${brand} •••• ${last4}${exp ? ` (${exp})` : ''}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobrar Cliente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business */}
          <div>
            <Label>Business</Label>
            <Select
              value={selectedClinicId}
              onValueChange={(v) => {
                setSelectedClinicId(v)
                const found = clinics.find(c => c.id === v)
                setSlug(found?.slug || '')
              }}
              disabled={loadingClinics || !!clinicId}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingClinics ? 'Carregando...' : 'Selecione'} />
              </SelectTrigger>
              <SelectContent>
                {clinics.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product */}
          <div>
            <Label>Produto</Label>
            <Select
              value={productId}
              onValueChange={setProductId}
              disabled={loadingProducts}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingProducts ? 'Carregando...' : 'Selecione'} />
              </SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Offer */}
          <div>
            <Label>Oferta</Label>
            <Select
              value={selectedOfferId}
              onValueChange={setSelectedOfferId}
              disabled={loadingOffers || offers.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingOffers ? 'Carregando...' : 'Selecione'} />
              </SelectTrigger>
              <SelectContent>
                {offers.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} {o.isSubscription ? '(Assinatura)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOffer && (
              <p className="text-xs text-gray-500 mt-1">
                Países disponíveis: {selectedOffer.countries.join(', ') || 'Nenhum'}
              </p>
            )}
          </div>

          {/* Country */}
          <div>
            <Label>País</Label>
            <Select
              value={country}
              onValueChange={setCountry}
              disabled={!selectedOffer || selectedOffer.countries.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {selectedOffer?.countries.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOffer && selectedOffer.countries.length === 0 && (
              <p className="text-xs text-red-600 mt-1">
                ⚠️ Esta oferta não tem preços configurados. Configure no editor de ofertas.
              </p>
            )}
          </div>

          {/* Saved Cards */}
          <div>
            <Label>Cartão Salvo</Label>
            {loadingCards ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : compatibleCards.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                <AlertCircle className="h-4 w-4" />
                <div>
                  <div className="font-medium">Nenhum cartão compatível</div>
                  <div className="text-xs mt-1">
                    Providers disponíveis para {country}: {availableProviders.join(', ') || 'Nenhum'}
                  </div>
                  <div className="text-xs">
                    Cartões salvos: {savedCards.map(c => c.provider).join(', ') || 'Nenhum'}
                  </div>
                </div>
              </div>
            ) : (
              <RadioGroup value={selectedCardId} onValueChange={setSelectedCardId}>
                {compatibleCards.map(card => (
                  <div key={card.id} className="flex items-center space-x-2">
                    <RadioGroupItem value={card.id} id={card.id} />
                    <Label htmlFor={card.id} className="flex items-center gap-2 cursor-pointer flex-1">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span>{formatCard(card)}</span>
                      <span className="text-xs text-gray-500">({displayProviderName(card.provider)})</span>
                      {card.isDefault && (
                        <span className="text-xs text-blue-600 font-medium">(Padrão)</span>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>

          {/* Installments */}
          {selectedOffer && country === 'BR' && (
            <div>
              <Label>Parcelas</Label>
              <Select
                value={String(installments)}
                onValueChange={(v) => setInstallments(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: selectedOffer.maxInstallments || 1 }, (_, i) => i + 1).map(i => (
                    <SelectItem key={i} value={String(i)}>{i}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Price Preview */}
          {finalPrice && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <div className="font-medium text-blue-900">Valor da cobrança</div>
              <div className="text-2xl font-bold text-blue-900 mt-1">
                {formatMoney(finalPrice.amountCents, finalPrice.currency)}
              </div>
              <div className="text-xs text-blue-700 mt-1">
                Provider: {displayProviderName(finalPrice.provider)} | Moeda: {finalPrice.currency}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-md p-3">
              <div className="font-medium">✅ Cobrança criada!</div>
              {result.order_id && (
                <div className="text-xs mt-1">Order ID: {result.order_id}</div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!isValid || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                'Cobrar'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
