# CORREÇÃO CRÍTICA: Webhooks não disparavam em produção

## ❌ Problema identificado

Webhooks **NÃO estavam sendo emitidos** quando transações eram criadas via:
- **AppMax** (PIX e Cartão)
- **Open Finance** (PIX)

### Causa raiz
Os checkouts criavam a `payment_transaction` mas **não chamavam** `onPaymentTransactionCreated()`.

## ✅ Correções aplicadas

### 1. AppMax (`src/app/api/checkout/appmax/create/route.ts`)
- **Adicionado:** chamada a `onPaymentTransactionCreated(txId)` após criar transação
- **Linha:** ~350-357
- **Impacto:** PIX e Cartão AppMax agora emitem `payment.transaction.created`

### 2. Open Finance (`src/app/api/open-finance/payments/route.ts`)
- **Adicionado:** import de `onPaymentTransactionCreated`
- **Adicionado:** chamada após criar transação
- **Linha:** ~292-298
- **Impacto:** PIX Open Finance agora emite `payment.transaction.created`

### 3. AppMax Webhook Handler (`src/app/api/webhooks/appmax/route.ts`)
- **Corrigido:** variável `orderId` elevada para escopo externo
- **Corrigido:** log de evento indefinido
- **Impacto:** handler mais robusto e sem erros silenciosos

## 📋 Checklist de emissão de webhooks

### Checkouts que JÁ emitiam corretamente ✅
- ✅ Stripe (`/api/checkout/stripe/create`)
- ✅ Stripe Subscribe (`/api/checkout/stripe/subscribe`)
- ✅ Stripe Finalize (`/api/checkout/stripe/finalize`)
- ✅ Stripe Record (`/api/checkout/stripe/record`)
- ✅ Checkout genérico (`/api/checkout/create`) - Stripe e KRXPay
- ✅ Subscribe genérico (`/api/checkout/subscribe`)

### Checkouts corrigidos agora ✅
- ✅ AppMax (`/api/checkout/appmax/create`) - **CORRIGIDO**
- ✅ Open Finance (`/api/open-finance/payments`) - **CORRIGIDO**

### Webhooks de mudança de status ✅
- ✅ AppMax webhook (`/api/webhooks/appmax`) - chama `onPaymentTransactionStatusChanged()`
- ✅ Stripe webhook (`/api/webhooks/stripe`) - chama `onPaymentTransactionStatusChanged()`
- ✅ Pagar.me webhook (`/api/payments/pagarme/webhook`) - chama `onPaymentTransactionStatusChanged()`

## 🔧 Como garantir que webhooks sempre disparem

### Regra obrigatória para novos checkouts
Sempre que criar uma `payment_transaction`, adicione imediatamente após:

```typescript
// Após INSERT/CREATE da payment_transaction
const txId = txRows?.[0]?.id // ou o ID retornado

// Emit webhook: payment.transaction.created
if (txId) {
  try {
    await onPaymentTransactionCreated(String(txId))
    console.log('[provider][create] ✅ webhook emitted', { txId })
  } catch (e) {
    console.warn('[provider][create] ⚠️ webhook emission failed (non-blocking)', e instanceof Error ? e.message : e)
  }
}
```

### Regra obrigatória para webhooks de providers
Sempre que atualizar status de uma transação, chame:

```typescript
// Após UPDATE do status
if (result > 0 && mapped) {
  try {
    const tx = await prisma.paymentTransaction.findFirst({
      where: { provider: 'PROVIDER', providerOrderId: String(orderId) },
      select: { id: true, clinicId: true, status_v2: true }
    })
    if (tx?.clinicId && tx?.status_v2) {
      await onPaymentTransactionStatusChanged(tx.id, String(tx.status_v2))
    }
  } catch (e) {
    console.warn('[provider][webhook] outbound event emission failed (non-blocking)', e instanceof Error ? e.message : e)
  }
}
```

## 🎯 Validações necessárias

### Para `onPaymentTransactionCreated()` funcionar:
1. ✅ Transação deve ter `clinicId` preenchido
2. ✅ Deve existir ao menos 1 `webhook_endpoint`:
   - `clinicId` = mesmo da transação
   - `enabled = true`
   - `events` contém `'payment.transaction.created'`
3. ✅ Variáveis de ambiente setadas:
   - `WEBHOOKS_USE_NATIVE=true` (para disparo imediato)
   - `APP_BASE_URL` (para construir URL de callback)
   - `WEBHOOKS_CRON_SECRET` (para pump/retry)

### Para `onPaymentTransactionStatusChanged()` funcionar:
1. ✅ Transação deve ter `clinicId` preenchido
2. ✅ Deve existir ao menos 1 `webhook_endpoint`:
   - `clinicId` = mesmo da transação
   - `enabled = true`
   - `events` contém o tipo mapeado (ex.: `'payment.transaction.succeeded'`)
3. ✅ Mesmas variáveis de ambiente acima

## 🚀 Deploy e teste

### 1. Fazer commit e push
```bash
git add .
git commit -m "fix: webhooks não disparavam para AppMax e Open Finance"
git push origin main
```

### 2. Verificar deploy na Vercel
- Aguardar deploy automático
- Confirmar que variáveis de ambiente estão setadas em Production:
  - `WEBHOOKS_USE_NATIVE=true`
  - `APP_BASE_URL=https://seu-app.vercel.app`
  - `WEBHOOKS_CRON_SECRET=<secret>`

### 3. Testar em produção
- Criar uma compra via AppMax (PIX ou Cartão)
- Verificar logs da Vercel:
  - `[appmax][create] ✅ webhook emitted`
- Verificar banco:
```sql
SELECT * FROM outbound_webhook_events 
WHERE clinic_id = '<clinic_id>' 
ORDER BY created_at DESC 
LIMIT 10;

SELECT * FROM outbound_webhook_deliveries 
WHERE event_id IN (
  SELECT id FROM outbound_webhook_events 
  WHERE clinic_id = '<clinic_id>' 
  ORDER BY created_at DESC 
  LIMIT 10
);
```

### 4. Verificar entrega no endpoint
- Abrir painel do Make.com/webhook.site
- Confirmar recebimento do POST com:
  - Headers: `X-Webhook-Id`, `X-Webhook-Event`, `X-Webhook-Signature`
  - Body: `{ specVersion, id, type, data: { transaction: {...} } }`

## 📊 Monitoramento contínuo

### Queries úteis
```sql
-- Transações criadas sem webhook emitido (problema!)
SELECT pt.id, pt.provider, pt.created_at, pt.clinic_id
FROM payment_transactions pt
LEFT JOIN outbound_webhook_events owe 
  ON owe.resource_id = pt.id AND owe.type = 'payment.transaction.created'
WHERE pt.created_at > NOW() - INTERVAL '24 hours'
  AND pt.clinic_id IS NOT NULL
  AND owe.id IS NULL
ORDER BY pt.created_at DESC;

-- Deliveries pendentes há mais de 1h
SELECT d.id, d.status, d.attempts, d.created_at, e.type, ep.name
FROM outbound_webhook_deliveries d
JOIN outbound_webhook_events e ON e.id = d.event_id
JOIN webhook_endpoints ep ON ep.id = d.endpoint_id
WHERE d.status = 'PENDING'
  AND d.created_at < NOW() - INTERVAL '1 hour'
ORDER BY d.created_at DESC;

-- Taxa de sucesso por endpoint (últimas 24h)
SELECT 
  ep.name,
  COUNT(*) as total_deliveries,
  SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered,
  ROUND(100.0 * SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM outbound_webhook_deliveries d
JOIN webhook_endpoints ep ON ep.id = d.endpoint_id
WHERE d.created_at > NOW() - INTERVAL '24 hours'
GROUP BY ep.id, ep.name
ORDER BY total_deliveries DESC;
```

## 🔍 Troubleshooting

### Webhook não dispara mesmo após correção
1. **Verificar clinicId:** transação tem `clinic_id` preenchido?
2. **Verificar endpoint:** existe endpoint ativo para essa clínica com o evento?
3. **Verificar logs:** procurar por `[provider][create] ✅ webhook emitted` nos logs da Vercel
4. **Verificar envs:** `WEBHOOKS_USE_NATIVE` e `APP_BASE_URL` estão setados?

### Delivery fica PENDING
1. **GitHub Actions:** workflow está rodando? (a cada 5 min)
2. **URL do endpoint:** é HTTPS? Está acessível publicamente?
3. **Secret do cron:** `WEBHOOKS_CRON_SECRET` está igual no GitHub e Vercel?

### Endpoint recebe mas assinatura inválida
1. **Secret do endpoint:** conferir valor no banco (`webhook_endpoints.secret`)
2. **Validação HMAC:** implementar corretamente no receptor:
```typescript
const payload = `${timestamp}.${body}`;
const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');
return signature === expectedSignature;
```

## ✅ Status final

- ✅ AppMax corrigido
- ✅ Open Finance corrigido
- ✅ AppMax webhook handler corrigido
- ✅ Documentação criada
- ✅ Queries de monitoramento prontas
- ✅ Guia de troubleshooting completo

**Próximo passo:** Fazer commit, push e testar em produção.
