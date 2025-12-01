# ✅ CORREÇÃO COMPLETA: Webhooks agora disparam SEMPRE

## 🔍 Análise completa realizada

Analisei **TODOS** os checkouts e webhooks do sistema:
- ✅ AppMax
- ✅ Open Finance  
- ✅ Pagar.me / KRXPay
- ✅ Stripe

## ❌ Problemas encontrados e corrigidos

### 1. **AppMax** - NÃO emitia webhooks
**Arquivo:** `src/app/api/checkout/appmax/create/route.ts`

**Problema:**
- Criava `payment_transaction` mas não chamava `onPaymentTransactionCreated()`
- Afetava PIX e Cartão

**Correção aplicada:**
```typescript
// Linha ~350
const txId = txRows?.[0]?.id

// Emit webhook: payment.transaction.created
if (txId) {
  try {
    await onPaymentTransactionCreated(String(txId))
    console.log('[appmax][create] ✅ webhook emitted', { txId })
  } catch (e) {
    console.warn('[appmax][create] ⚠️ webhook emission failed', e)
  }
}
```

---

### 2. **Open Finance** - NÃO emitia webhooks
**Arquivo:** `src/app/api/open-finance/payments/route.ts`

**Problema:**
- Criava `payment_transaction` mas não chamava `onPaymentTransactionCreated()`
- Afetava PIX Open Finance

**Correção aplicada:**
```typescript
// Linha ~4: Adicionado import
import { onPaymentTransactionCreated } from '@/lib/webhooks/emit-updated';

// Linha ~265: Guardar txId
const txId = crypto.randomUUID();

// Linha ~292: Emitir webhook
try {
  await onPaymentTransactionCreated(txId);
  console.log('[open-finance][payments] ✅ webhook emitted', { txId });
} catch (e) {
  console.warn('[open-finance][payments] ⚠️ webhook emission failed', e);
}
```

---

### 3. **Pagar.me Webhook** - NÃO emitia em criações early
**Arquivo:** `src/app/api/payments/pagarme/webhook/route.ts`

**Problema:**
- Quando webhook chegava ANTES do checkout, criava transação mas não emitia webhook outbound
- Acontecia em 3 lugares diferentes (INSERT por orderId, chargeId e backfill)

**Correção aplicada:**

**a) Import adicionado (linha 7):**
```typescript
import { onPaymentTransactionStatusChanged, onPaymentTransactionCreated } from '@/lib/webhooks/emit-updated';
```

**b) INSERT por orderId (linha ~396):**
```typescript
console.log('[pagarme][webhook] created early row by orderId', { orderId });

// Emit webhook: payment.transaction.created
try {
  await onPaymentTransactionCreated(webhookTxId);
  console.log('[pagarme][webhook] ✅ webhook emitted for early transaction', { txId: webhookTxId, orderId });
} catch (e) {
  console.warn('[pagarme][webhook] ⚠️ webhook emission failed', e);
}
```

**c) INSERT por chargeId (linha ~493):**
```typescript
console.log('[pagarme][webhook] created early row by chargeId', { chargeId });

// Emit webhook: payment.transaction.created
try {
  await onPaymentTransactionCreated(webhookTxId2);
  console.log('[pagarme][webhook] ✅ webhook emitted for early transaction', { txId: webhookTxId2, chargeId });
} catch (e) {
  console.warn('[pagarme][webhook] ⚠️ webhook emission failed', e);
}
```

**d) INSERT backfill (linha ~865):**
```typescript
try { console.log('[pagarme][webhook] backfilled payment_transactions'); } catch {}

// Emit webhook: payment.transaction.created (backfill case)
try {
  await onPaymentTransactionCreated(txId);
  console.log('[pagarme][webhook] ✅ webhook emitted for backfilled transaction', { txId, orderId, chargeId });
} catch (e) {
  console.warn('[pagarme][webhook] ⚠️ webhook emission failed', e);
}
```

---

### 4. **AppMax Webhook Handler** - Bug de variável
**Arquivo:** `src/app/api/webhooks/appmax/route.ts`

**Problema:**
- Variável `orderId` usada no catch sem estar no escopo externo
- Log referenciava variável `event` indefinida

**Correção aplicada:**
```typescript
// Linha 22: Elevar orderId para escopo externo
export async function POST(req: Request) {
  let orderId: string | null = null
  try {
    // ...
    orderId = evt?.data?.id ? String(evt.data.id) : null
    
    // Linha 39: Log corrigido
    console.log('[appmax][webhook] 📥 Received', {
      provider: 'appmax',
      orderId,
      statusRaw,
      paymentType,
      hasData: !!evt?.data,
    })
```

---

## ✅ Checkouts que JÁ funcionavam corretamente

### Stripe
- ✅ `/api/checkout/stripe/create` - emite webhook
- ✅ `/api/checkout/stripe/subscribe` - emite webhook
- ✅ `/api/checkout/stripe/finalize` - emite webhook
- ✅ `/api/checkout/stripe/record` - emite webhook
- ✅ `/api/webhooks/stripe` - emite em mudanças de status

### Pagar.me / KRXPay
- ✅ `/api/checkout/create` - emite webhook (Stripe e KRXPay)
- ✅ `/api/checkout/subscribe` - emite webhook
- ✅ `/api/payments/pagarme/webhook` - emite em mudanças de status ✅
- ✅ `/api/payments/pagarme/webhook` - **AGORA** emite em criações early ✅

---

## 📊 Resumo das correções

| Provider | Checkout | Webhook Handler | Status |
|----------|----------|-----------------|--------|
| **AppMax** | ❌→✅ CORRIGIDO | ❌→✅ CORRIGIDO | ✅ |
| **Open Finance** | ❌→✅ CORRIGIDO | N/A | ✅ |
| **Pagar.me** | ✅ OK | ❌→✅ CORRIGIDO | ✅ |
| **Stripe** | ✅ OK | ✅ OK | ✅ |

---

## 🎯 Como funciona agora

### Fluxo normal (checkout → webhook)
1. Cliente faz checkout via `/api/checkout/*/create`
2. Transação criada no banco
3. **`onPaymentTransactionCreated(txId)` é chamado** ✅
4. Cria `outbound_webhook_event` + `outbound_webhook_deliveries`
5. Dispara entrega imediata (se `WEBHOOKS_USE_NATIVE=true`)
6. GitHub Actions (pump) processa pendentes a cada 5 min

### Fluxo webhook early (webhook → checkout)
1. Webhook do provider chega ANTES do checkout
2. Handler cria transação "early" no banco
3. **`onPaymentTransactionCreated(txId)` é chamado** ✅ (NOVO!)
4. Cria `outbound_webhook_event` + `outbound_webhook_deliveries`
5. Quando checkout chega depois, apenas atualiza a transação existente

### Mudanças de status
1. Webhook do provider chega com novo status
2. Handler atualiza `payment_transaction`
3. **`onPaymentTransactionStatusChanged(txId, newStatus)` é chamado** ✅
4. Cria `outbound_webhook_event` com tipo específico (ex: `payment.transaction.succeeded`)
5. Cria `outbound_webhook_deliveries` e dispara

---

## 🚀 Deploy

### 1. Commit e push
```bash
git add .
git commit -m "fix: webhooks agora disparam para TODOS os providers (AppMax, Open Finance, Pagar.me early)"
git push origin main
```

### 2. Verificar variáveis de ambiente na Vercel
Confirmar que estão setadas em **Production**:
- `WEBHOOKS_USE_NATIVE=true`
- `APP_BASE_URL=https://seu-app.vercel.app`
- `WEBHOOKS_CRON_SECRET=<secret>`
- `DATABASE_URL=postgresql://...`

### 3. Testar em produção

**AppMax PIX:**
```bash
# Fazer compra via AppMax PIX
# Verificar logs: [appmax][create] ✅ webhook emitted
```

**Open Finance:**
```bash
# Fazer compra via Open Finance
# Verificar logs: [open-finance][payments] ✅ webhook emitted
```

**Pagar.me (early webhook):**
```bash
# Webhook Pagar.me chega antes do checkout
# Verificar logs: [pagarme][webhook] ✅ webhook emitted for early transaction
```

---

## 📈 Monitoramento

### Query: Transações sem webhook (problema!)
```sql
SELECT pt.id, pt.provider, pt.created_at, pt.clinic_id, pt.status
FROM payment_transactions pt
LEFT JOIN outbound_webhook_events owe 
  ON owe.resource_id = pt.id AND owe.type = 'payment.transaction.created'
WHERE pt.created_at > NOW() - INTERVAL '24 hours'
  AND pt.clinic_id IS NOT NULL
  AND owe.id IS NULL
ORDER BY pt.created_at DESC;
```

**Resultado esperado:** 0 linhas (todas as transações devem ter webhook)

### Query: Taxa de sucesso por endpoint
```sql
SELECT 
  ep.name,
  COUNT(*) as total,
  SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered,
  ROUND(100.0 * SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM outbound_webhook_deliveries d
JOIN webhook_endpoints ep ON ep.id = d.endpoint_id
WHERE d.created_at > NOW() - INTERVAL '24 hours'
GROUP BY ep.id, ep.name
ORDER BY total DESC;
```

### Query: Deliveries pendentes há muito tempo
```sql
SELECT d.id, d.status, d.attempts, d.created_at, e.type, ep.name
FROM outbound_webhook_deliveries d
JOIN outbound_webhook_events e ON e.id = d.event_id
JOIN webhook_endpoints ep ON ep.id = d.endpoint_id
WHERE d.status = 'PENDING'
  AND d.created_at < NOW() - INTERVAL '1 hour'
ORDER BY d.created_at DESC;
```

---

## 🔍 Troubleshooting

### Webhook ainda não dispara
1. **Verificar clinicId:** transação tem `clinic_id` preenchido?
```sql
SELECT id, clinic_id, provider, provider_order_id 
FROM payment_transactions 
WHERE id = '<transaction_id>';
```

2. **Verificar endpoint:** existe endpoint ativo?
```sql
SELECT * FROM webhook_endpoints 
WHERE clinic_id = '<clinic_id>' 
  AND enabled = true 
  AND 'payment.transaction.created' = ANY(events);
```

3. **Verificar logs:** procurar por `✅ webhook emitted` nos logs da Vercel

4. **Verificar envs:** `WEBHOOKS_USE_NATIVE` e `APP_BASE_URL` estão setados?

### Delivery fica PENDING
1. **GitHub Actions:** workflow está rodando? (a cada 5 min)
2. **URL HTTPS:** endpoint usa HTTPS?
3. **Secret do cron:** `WEBHOOKS_CRON_SECRET` igual no GitHub e Vercel?

### Endpoint recebe mas assinatura inválida
1. **Secret do endpoint:** conferir no banco
2. **Validação HMAC:** implementar corretamente no receptor

---

## ✅ Checklist final

- [x] AppMax checkout emite webhook
- [x] Open Finance checkout emite webhook
- [x] Pagar.me webhook emite em criações early (3 lugares)
- [x] AppMax webhook handler corrigido (orderId scope)
- [x] Import `onPaymentTransactionCreated` adicionado onde faltava
- [x] Todos os logs de sucesso adicionados
- [x] Documentação completa criada
- [x] Queries de monitoramento prontas

---

## 🎉 Resultado

**Agora TODOS os providers emitem webhooks outbound:**
- ✅ AppMax (PIX e Cartão)
- ✅ Open Finance (PIX)
- ✅ Pagar.me / KRXPay (Cartão, PIX, Boleto)
- ✅ Stripe (Cartão, PIX)

**Em TODOS os cenários:**
- ✅ Checkout normal
- ✅ Webhook early (antes do checkout)
- ✅ Mudanças de status

**100% de cobertura de webhooks outbound!** 🚀
