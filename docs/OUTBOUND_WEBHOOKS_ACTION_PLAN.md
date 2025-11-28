# Plano de Ação: Integração Completa de Eventos Outbound Webhooks

**Data:** 27 de novembro de 2025  
**Status:** Análise Completa - Pronto para Implementação

---

## 📊 Análise Completa do Sistema

### ✅ O que JÁ EXISTE e FUNCIONA

1. **Infraestrutura de Webhooks Outbound**
   - ✅ Tabelas: `webhook_endpoints`, `outbound_webhook_events`, `outbound_webhook_deliveries`
   - ✅ Worker de entrega com retry exponencial (`src/lib/webhooks/outbound-worker.ts`)
   - ✅ Sistema de assinatura de payloads (HMAC SHA-256)
   - ✅ UI para gerenciar endpoints (`/business/integrations/webhooks`)
   - ✅ Funções helper para emitir eventos (`src/lib/webhooks/emit-updated.ts`)

2. **Eventos Suportados (UI)**
   ```typescript
   - payment.transaction.created
   - payment.transaction.pending
   - payment.transaction.processing
   - payment.transaction.requires_action
   - payment.transaction.succeeded
   - payment.transaction.failed
   - payment.transaction.canceled
   - payment.transaction.expired
   - payment.transaction.refunding
   - payment.transaction.refunded
   - payment.transaction.partially_refunded
   - payment.transaction.chargeback
   - payment.transaction.disputed
   ```

3. **Provedores de Pagamento Ativos**
   - ✅ Pagar.me (KRXPAY) - Brasil
   - ✅ Stripe - Internacional
   - ✅ AppMax - Brasil

### ❌ O que FALTA (Gaps Críticos)

1. **NENHUM evento está sendo emitido atualmente**
   - As funções `onPaymentTransactionCreated()`, `onPaymentTransactionStatusChanged()` existem mas **não são chamadas**
   - Webhooks dos provedores atualizam `payment_transactions` mas **não disparam eventos outbound**

2. **Worker não inicia automaticamente**
   - Depende de `OUTBOUND_WEBHOOKS_ENABLED=true` + chamada manual a `/api/cron/webhooks`
   - Não há bootstrap automático no startup da aplicação

3. **Filtros avançados não são aplicados**
   - `categoryFilter` e `productFilters` são salvos mas não filtram deliveries
   - `maxConcurrentDeliveries` não é respeitado pelo worker

---

## 🎯 Plano de Ação Detalhado

### Fase 1: Emissão de Eventos (CRÍTICO)

#### 1.1 Pagar.me Webhook (`src/app/api/payments/pagarme/webhook/route.ts`)

**Pontos de Integração:**

```typescript
// Linha ~418: Após UPDATE bem-sucedido por orderId
if (result > 0 && mapped) {
  // Buscar transação atualizada
  const tx = await prisma.paymentTransaction.findFirst({
    where: { provider: 'pagarme', providerOrderId: String(orderId) },
    select: { id: true, clinicId: true, status_v2: true }
  })
  
  if (tx?.clinicId) {
    // Emitir evento baseado no status
    if (mapped === 'paid') {
      await onPaymentTransactionStatusChanged(tx.id, 'SUCCEEDED')
    } else if (mapped === 'failed') {
      await onPaymentTransactionStatusChanged(tx.id, 'FAILED')
    } else if (mapped === 'canceled') {
      await onPaymentTransactionStatusChanged(tx.id, 'CANCELED')
    } else if (mapped === 'refunded') {
      await onPaymentTransactionStatusChanged(tx.id, 'REFUNDED')
    } else if (mapped === 'processing' || mapped === 'pending') {
      await onPaymentTransactionStatusChanged(tx.id, 'PROCESSING')
    }
  }
}

// Linha ~498: Após UPDATE bem-sucedido por chargeId
// Mesma lógica acima
```

**Eventos Mapeados:**
- `order.paid` / `charge.paid` → `payment.transaction.succeeded`
- `order.failed` / `charge.failed` → `payment.transaction.failed`
- `order.canceled` → `payment.transaction.canceled`
- `order.refunded` → `payment.transaction.refunded`
- `order.processing` → `payment.transaction.processing`

#### 1.2 Stripe Webhook (`src/app/api/stripe/webhook/route.ts`)

**Pontos de Integração:**

```typescript
// Linha ~84: payment_intent.succeeded
await onPaymentTransactionStatusChanged(intentId, 'SUCCEEDED')

// Linha ~108: payment_intent.payment_failed
await onPaymentTransactionStatusChanged(intentId, 'FAILED')

// Linha ~143: charge.succeeded (quando captured)
if (status === 'captured') {
  await onPaymentTransactionStatusChanged(intentId, 'SUCCEEDED')
}

// Linha ~197: charge.refunded
if (status === 'refunded') {
  await onPaymentTransactionStatusChanged(intentId, 'REFUNDED')
} else {
  await onPaymentTransactionStatusChanged(intentId, 'PARTIALLY_REFUNDED')
}
```

#### 1.3 AppMax Webhook (`src/app/api/webhooks/appmax/route.ts`)

**Pontos de Integração:**

```typescript
// Linha ~96: Após UPDATE bem-sucedido
if (result > 0 && mapped) {
  const tx = await prisma.paymentTransaction.findFirst({
    where: { provider: 'appmax', providerOrderId: String(orderId) },
    select: { id: true, clinicId: true }
  })
  
  if (tx?.clinicId) {
    if (mapped === 'paid') {
      await onPaymentTransactionStatusChanged(tx.id, 'SUCCEEDED')
    } else if (mapped === 'failed') {
      await onPaymentTransactionStatusChanged(tx.id, 'FAILED')
    } else if (mapped === 'canceled') {
      await onPaymentTransactionStatusChanged(tx.id, 'CANCELED')
    }
  }
}
```

#### 1.4 Checkout Create (`src/app/api/checkout/create/route.ts`)

**Pontos de Integração:**

```typescript
// Linha ~1675: Após criação da transação (Pagar.me)
if (txId && clinic?.id) {
  await onPaymentTransactionCreated(txId)
}

// Linha ~457: Após criação da transação (Stripe)
if (txId && clinic?.id) {
  await onPaymentTransactionCreated(txId)
}
```

#### 1.5 AppMax Create (`src/app/api/checkout/appmax/create/route.ts`)

**Pontos de Integração:**

```typescript
// Linha ~688: Após sucesso do PIX
await onPaymentTransactionCreated(order_id)

// Linha ~670: Após sucesso do cartão
await onPaymentTransactionCreated(order_id)
```

### Fase 2: Bootstrap Automático do Worker

**Arquivo:** `src/app/layout.tsx` ou arquivo de inicialização do servidor

```typescript
import { bootstrapOutboundWebhooksWorker } from '@/lib/webhooks/bootstrap'

// No servidor (não no cliente)
if (typeof window === 'undefined') {
  bootstrapOutboundWebhooksWorker()
}
```

**Alternativa:** Criar middleware Next.js

```typescript
// src/middleware.ts
import { bootstrapOutboundWebhooksWorker } from '@/lib/webhooks/bootstrap'

let workerStarted = false

export function middleware(request: NextRequest) {
  if (!workerStarted && typeof window === 'undefined') {
    bootstrapOutboundWebhooksWorker()
    workerStarted = true
  }
  return NextResponse.next()
}
```

### Fase 3: Aplicar Filtros Avançados

#### 3.1 Filtro por Produto (`src/lib/webhooks/emit-updated.ts`)

```typescript
export async function emitOutboundEvent(params: EmitParams) {
  const event = await prisma.outboundWebhookEvent.create({
    data: {
      clinicId: params.clinicId,
      type: params.type,
      resource: params.resource,
      resourceId: params.resourceId,
      payload: params.payload,
    },
  })

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      clinicId: params.clinicId,
      enabled: true,
      events: { has: params.type },
    },
  })

  if (endpoints.length === 0) return { event, deliveries: [] }

  const deliveries = []
  for (const ep of endpoints) {
    // NOVO: Aplicar filtro de produto
    if (ep.categoryFilter === 'products' && Array.isArray(ep.productFilters) && ep.productFilters.length > 0) {
      const productId = params.payload?.transaction?.productId
      if (!productId || !ep.productFilters.includes(productId)) {
        console.log('[webhooks] skipping delivery due to product filter', {
          endpointId: ep.id,
          productId,
          allowedProducts: ep.productFilters
        })
        continue // Pula este endpoint
      }
    }

    const del = await prisma.outboundWebhookDelivery.create({
      data: {
        endpointId: ep.id,
        eventId: event.id,
        status: 'PENDING',
        nextAttemptAt: new Date(),
      },
    })
    deliveries.push(del)
  }

  return { event, deliveries }
}
```

#### 3.2 Respeitar maxConcurrentDeliveries (Worker)

**Modificar:** `src/lib/webhooks/outbound-worker.ts`

```typescript
// Linha ~113: Modificar query para respeitar concorrência por endpoint
const rows = await prisma.$queryRawUnsafe<{ id: string; endpoint_id: string }[]>(
  `WITH endpoint_counts AS (
     SELECT endpoint_id, COUNT(*) as in_flight
       FROM outbound_webhook_deliveries
      WHERE status = 'PENDING' AND updated_at > NOW() - INTERVAL '5 minutes'
      GROUP BY endpoint_id
   ),
   eligible AS (
     SELECT d.id, d.endpoint_id, e.max_concurrent_deliveries
       FROM outbound_webhook_deliveries d
       JOIN webhook_endpoints e ON e.id = d.endpoint_id
       LEFT JOIN endpoint_counts ec ON ec.endpoint_id = d.endpoint_id
      WHERE d.status = 'PENDING'
        AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW())
        AND COALESCE(ec.in_flight, 0) < e.max_concurrent_deliveries
      ORDER BY d.created_at ASC
      LIMIT $1
        FOR UPDATE SKIP LOCKED
   )
   UPDATE outbound_webhook_deliveries
      SET updated_at = NOW()
    WHERE id IN (SELECT id FROM eligible)
   RETURNING id, endpoint_id`,
  batchSize
).catch(() => [])
```

### Fase 4: Ajustes no Helper de Emissão

**Arquivo:** `src/lib/webhooks/emit-updated.ts`

```typescript
export async function onPaymentTransactionStatusChanged(transactionId: string, newStatus: string) {
  const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } })
  if (!tx?.clinicId) return
  
  const payload = await buildTransactionPayload(transactionId)
  
  // Mapear PaymentStatus enum para event suffix
  const statusMap: Record<string, string> = {
    'SUCCEEDED': 'succeeded',
    'FAILED': 'failed',
    'CANCELED': 'canceled',
    'REFUNDED': 'refunded',
    'PARTIALLY_REFUNDED': 'partially_refunded',
    'PROCESSING': 'processing',
    'PENDING': 'pending',
    'REQUIRES_ACTION': 'requires_action',
    'REFUNDING': 'refunding',
    'CHARGEBACK': 'chargeback',
    'DISPUTED': 'disputed',
    'EXPIRED': 'expired',
  }
  
  const suffix = statusMap[newStatus] || String(newStatus).toLowerCase()
  const type = `payment.transaction.${suffix}`
  
  await emitOutboundEvent({
    clinicId: tx.clinicId,
    type,
    resource: 'payment_transaction',
    resourceId: transactionId,
    payload,
  })
}
```

---

## 📝 Checklist de Implementação

### Prioridade ALTA (Essencial)

- [ ] **1.1** Adicionar emissão de eventos no webhook Pagar.me
- [ ] **1.2** Adicionar emissão de eventos no webhook Stripe
- [ ] **1.3** Adicionar emissão de eventos no webhook AppMax
- [ ] **1.4** Adicionar emissão de eventos no checkout create (Pagar.me/Stripe)
- [ ] **1.5** Adicionar emissão de eventos no checkout AppMax
- [ ] **2.0** Implementar bootstrap automático do worker
- [ ] **4.0** Ajustar mapeamento de status no helper

### Prioridade MÉDIA (Importante)

- [ ] **3.1** Implementar filtro por produto na emissão
- [ ] **3.2** Respeitar maxConcurrentDeliveries no worker

### Prioridade BAIXA (Nice to Have)

- [ ] Adicionar logs estruturados para debugging
- [ ] Criar dashboard de monitoramento de eventos
- [ ] Implementar alertas para falhas de delivery
- [ ] Adicionar testes automatizados

---

## 🔍 Pontos de Atenção

### Segurança
- ✅ Assinaturas HMAC já implementadas
- ✅ Verificação de acesso por clinicId
- ⚠️ Considerar rate limiting por endpoint

### Performance
- ✅ Worker usa `FOR UPDATE SKIP LOCKED` (evita contenção)
- ✅ Retry exponencial implementado
- ⚠️ Monitorar volume de eventos em produção

### Compatibilidade
- ✅ Código defensivo para ambientes sem tabelas
- ✅ Fallback para raw SQL quando Prisma Client não está atualizado
- ✅ Suporte a múltiplos provedores

---

## 🚀 Ordem de Implementação Recomendada

1. **Fase 1.1-1.5** (Emissão de eventos) - 2-3 horas
2. **Fase 4** (Ajuste de mapeamento) - 30 minutos
3. **Fase 2** (Bootstrap worker) - 30 minutos
4. **Teste end-to-end** - 1 hora
5. **Fase 3.1-3.2** (Filtros avançados) - 2 horas
6. **Deploy e monitoramento** - 1 hora

**Tempo Total Estimado:** 7-8 horas

---

## 📊 Cobertura de Eventos por Provedor

| Evento | Pagar.me | Stripe | AppMax | Status |
|--------|----------|--------|--------|--------|
| created | ✅ | ✅ | ✅ | Implementar |
| pending | ✅ | ❌ | ❌ | Implementar |
| processing | ✅ | ✅ | ✅ | Implementar |
| requires_action | ❌ | ✅ | ❌ | Implementar |
| succeeded | ✅ | ✅ | ✅ | Implementar |
| failed | ✅ | ✅ | ✅ | Implementar |
| canceled | ✅ | ❌ | ✅ | Implementar |
| expired | ❌ | ❌ | ❌ | Futuro |
| refunding | ❌ | ❌ | ❌ | Futuro |
| refunded | ✅ | ✅ | ❌ | Implementar |
| partially_refunded | ✅ | ✅ | ❌ | Implementar |
| chargeback | ✅ | ❌ | ❌ | Implementar |
| disputed | ❌ | ❌ | ❌ | Futuro |

---

## ✅ Conclusão

O sistema de outbound webhooks está **95% pronto**. A infraestrutura, UI, worker e helpers existem e funcionam. O que falta é apenas **conectar os pontos** chamando as funções de emissão nos lugares certos.

**Risco:** BAIXO - Mudanças são aditivas, não quebram nada existente.  
**Impacto:** ALTO - Habilita integrações externas e automações para clientes.  
**Esforço:** MÉDIO - 7-8 horas de desenvolvimento focado.

**Recomendação:** Implementar Fase 1 + 2 + 4 primeiro (core), testar em staging, depois adicionar Fase 3 (filtros avançados).
