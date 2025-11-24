'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface SavedCard {
  id: string
  provider: string
  brand?: string
  last4?: string
  expMonth?: number
  expYear?: number
  isDefault: boolean
  status: string
}

interface ChargeCustomerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  patientName?: string
  patientEmail?: string
  clinicId: string
  clinicSlug: string
  onSuccess?: (transactionId: string) => void
}

export default function ChargeCustomerModal({
  open,
  onOpenChange,
  patientId,
  patientName,
  patientEmail,
  clinicId,
  clinicSlug,
  onSuccess
}: ChargeCustomerModalProps) {
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [isLoadingCards, setIsLoadingCards] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [amountBRL, setAmountBRL] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [isCharging, setIsCharging] = useState(false)
  const [chargeResult, setChargeResult] = useState<{ success: boolean; transactionId?: string; error?: string } | null>(null)

  // Carregar cartões salvos quando o modal abre
  useEffect(() => {
    if (open && patientId && clinicSlug) {
      loadSavedCards()
    } else {
      // Reset ao fechar
      setSavedCards([])
      setSelectedCardId('')
      setAmountBRL('')
      setDescription('')
      setChargeResult(null)
    }
  }, [open, patientId, clinicSlug])

  const loadSavedCards = async () => {
    try {
      setIsLoadingCards(true)
      const response = await fetch(`/api/payments/saved-cards?userId=${patientId}&slug=${clinicSlug}`)
      const data = await response.json()

      if (response.ok && data.ok) {
        const activeCards = data.data.filter((c: SavedCard) => c.status === 'ACTIVE')
        setSavedCards(activeCards)
        
        // Selecionar o cartão padrão automaticamente
        const defaultCard = activeCards.find((c: SavedCard) => c.isDefault)
        if (defaultCard) {
          setSelectedCardId(defaultCard.id)
        } else if (activeCards.length > 0) {
          setSelectedCardId(activeCards[0].id)
        }
      } else {
        toast.error(data.error || 'Erro ao carregar cartões')
      }
    } catch (error) {
      console.error('Error loading saved cards:', error)
      toast.error('Erro ao carregar cartões salvos')
    } finally {
      setIsLoadingCards(false)
    }
  }

  const handleCharge = async () => {
    if (!selectedCardId) {
      toast.error('Selecione um cartão')
      return
    }

    const amount = parseFloat(amountBRL.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) {
      toast.error('Valor inválido')
      return
    }

    const amountCents = Math.round(amount * 100)

    try {
      setIsCharging(true)
      setChargeResult(null)

      const response = await fetch('/api/payments/charge-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          clinicId,
          savedCardId: selectedCardId,
          amountCents,
          description: description || `Cobrança - ${patientName || patientEmail || 'Paciente'}`,
          metadata: {
            patientName,
            patientEmail
          }
        })
      })

      const data = await response.json()

      if (response.ok && data.ok) {
        setChargeResult({ success: true, transactionId: data.data.transactionId })
        toast.success('Cobrança realizada com sucesso!')
        
        if (onSuccess) {
          onSuccess(data.data.transactionId)
        }

        // Fechar modal após 2 segundos
        setTimeout(() => {
          onOpenChange(false)
        }, 2000)
      } else {
        setChargeResult({ success: false, error: data.error || 'Erro ao processar cobrança' })
        toast.error(data.error || 'Erro ao processar cobrança')
      }
    } catch (error) {
      console.error('Error charging customer:', error)
      setChargeResult({ success: false, error: 'Erro de conexão' })
      toast.error('Erro ao processar cobrança')
    } finally {
      setIsCharging(false)
    }
  }

  const formatCardDisplay = (card: SavedCard) => {
    const brand = card.brand?.toUpperCase() || card.provider
    const last4 = card.last4 || '****'
    const exp = card.expMonth && card.expYear ? `${String(card.expMonth).padStart(2, '0')}/${card.expYear}` : ''
    return `${brand} •••• ${last4}${exp ? ` (${exp})` : ''}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Cobrar Paciente</DialogTitle>
          <DialogDescription>
            {patientName || patientEmail || 'Paciente'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Cartões salvos */}
          <div className="space-y-2">
            <Label>Cartão de Crédito</Label>
            {isLoadingCards ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : savedCards.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                <AlertCircle className="h-4 w-4" />
                <span>Nenhum cartão salvo encontrado para este paciente</span>
              </div>
            ) : (
              <RadioGroup value={selectedCardId} onValueChange={setSelectedCardId}>
                {savedCards.map((card) => (
                  <div key={card.id} className="flex items-center space-x-2">
                    <RadioGroupItem value={card.id} id={card.id} />
                    <Label htmlFor={card.id} className="flex items-center gap-2 cursor-pointer flex-1">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span>{formatCardDisplay(card)}</span>
                      {card.isDefault && (
                        <span className="text-xs text-blue-600 font-medium">(Padrão)</span>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>

          {/* Valor */}
          <div className="space-y-2">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              type="text"
              placeholder="0,00"
              value={amountBRL}
              onChange={(e) => setAmountBRL(e.target.value)}
              disabled={isCharging || savedCards.length === 0}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Ex: Consulta, Exame, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isCharging || savedCards.length === 0}
              rows={3}
            />
          </div>

          {/* Resultado */}
          {chargeResult && (
            <div className={`flex items-center gap-2 rounded-md border p-4 text-sm ${
              chargeResult.success 
                ? 'border-green-200 bg-green-50 text-green-800' 
                : 'border-red-200 bg-red-50 text-red-800'
            }`}>
              {chargeResult.success ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Cobrança realizada!</div>
                    <div className="text-xs mt-1">ID: {chargeResult.transactionId}</div>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <span>{chargeResult.error}</span>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCharging}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCharge}
            disabled={isCharging || savedCards.length === 0 || !selectedCardId || !amountBRL || chargeResult?.success}
          >
            {isCharging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              'Cobrar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
