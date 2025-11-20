# Fix: Appmax Subscriptions não apareciam nas páginas

## Problema identificado

### 1. **Subscriptions não apareciam em `/business/subscriptions`**
- **Causa**: O checkout Appmax criava apenas `payment_transactions`, mas NÃO criava `customer_subscriptions`.
- **Impacto**: A página lê de `customer_subscriptions` → tabela vazia → lista vazia.

### 2. **Webhooks não apareciam em `/business/payments/webhooks`**
- **Causa**: A Appmax não estava enviando webhooks para o endpoint `POST /api/webhooks/appmax`.
- **Impacto**: Sem delivery → sem registro em `webhook_events` → não aparece na lista.

---

## Solução implementada

### ✅ Correção #1: Criar `customer_subscriptions` no checkout

**Arquivo**: `src/app/api/checkout/appmax/create/route.ts`

**O que foi adicionado** (linhas 329-425):

```typescript
// 3.5) If product is a subscription, create customer_subscriptions row
let customerSubscriptionId: string | null = null
if (product.type === 'SUBSCRIPTION' && unifiedCustomerId) {
  try {
    const interval = product.interval || 'MONTH'
    const intervalCount = product.intervalCount || 1
    const trialDays = Number(product.trialDays || 0)
    const hasTrial = trialDays > 0
    
    // Calculate periods
    const now = new Date()
    const startAt = now.toISOString()
    const trialEndsAt = hasTrial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null
    const currentPeriodStart = now.toISOString()
    
    // Calculate next billing based on interval
    const nextBilling = new Date(now)
    if (interval === 'DAY') nextBilling.setDate(nextBilling.getDate() + intervalCount)
    else if (interval === 'WEEK') nextBilling.setDate(nextBilling.getDate() + intervalCount * 7)
    else if (interval === 'MONTH') nextBilling.setMonth(nextBilling.getMonth() + intervalCount)
    else if (interval === 'YEAR') nextBilling.setFullYear(nextBilling.getFullYear() + intervalCount)
    const currentPeriodEnd = nextBilling.toISOString()
    
    const status = hasTrial ? 'TRIAL' : 'ACTIVE'
    const metadata = {
      interval,
      intervalCount,
      buyerName: String(buyer.name || ''),
      buyerEmail: String(buyer.email || ''),
      productName: String(product.name || ''),
      source: 'appmax_checkout',
      appmaxOrderId: order_id
    }
    
    // Upsert customer_subscriptions (SELECT first, then UPDATE or INSERT)
    const existingSub = await prisma.$queryRawUnsafe(...)
    
    if (existingSub && existingSub.length > 0) {
      // Update existing subscription
      subRows = await prisma.$executeRawUnsafe(`UPDATE customer_subscriptions ...`)
    } else {
      // Insert new subscription
      subRows = await prisma.$executeRawUnsafe(`INSERT INTO customer_subscriptions ...`)
    }
    
    // Link subscription to payment_transaction
    await prisma.$executeRawUnsafe(
      `UPDATE payment_transactions 
       SET customer_subscription_id = $2 
       WHERE provider = 'appmax' AND provider_order_id = $1`,
      String(order_id),
      customerSubscriptionId
    )
  }
}
```

**Comportamento**:
- ✅ Detecta se `product.type === 'SUBSCRIPTION'`
- ✅ Calcula `status` baseado em `trialDays`:
  - `TRIAL` se `trialDays > 0`
  - `ACTIVE` se sem trial
- ✅ Calcula `current_period_end` baseado em `interval` e `intervalCount`:
  - `DAY`: +N dias
  - `WEEK`: +N semanas (N * 7 dias)
  - `MONTH`: +N meses
  - `YEAR`: +N anos
- ✅ Persiste metadata completo (buyer, product, interval)
- ✅ Vincula subscription ao `payment_transaction` via `customer_subscription_id`

**Logs adicionados**:
```
[appmax][create][subscription] ✅ Subscription created/updated
```

---

## Como testar

### Teste 1: Criar subscription via checkout Appmax

```bash
# 1. Certifique-se que o produto tem type='SUBSCRIPTION'
# Exemplo: UPDATE products SET type='SUBSCRIPTION', interval='MONTH', interval_count=1 WHERE id='...'

# 2. Faça checkout via frontend (cartão ou PIX)

# 3. Verifique os logs do servidor:
# Deve aparecer:
# [appmax][create][subscription] ✅ Subscription created/updated

# 4. Verifique no banco:
SELECT id, customer_id, merchant_id, product_id, provider, status, 
       start_at, trial_ends_at, current_period_start, current_period_end, 
       metadata
FROM customer_subscriptions
WHERE provider = 'APPMAX'
ORDER BY created_at DESC
LIMIT 10;

# 5. Acesse a página:
# http://localhost:3000/business/subscriptions
# Deve aparecer a subscription criada
```

### Teste 2: Ver webhooks da Appmax (requer configuração)

#### Passo A: Configurar URL do webhook no painel Appmax

1. Acesse o painel sandbox da Appmax
2. Vá em Configurações → Webhooks (ou similar)
3. Configure a URL de callback:
   - **Produção**: `https://seu-dominio.com/api/webhooks/appmax`
   - **Desenvolvimento local**: Use túnel (ngrok/Cloudflared)
     ```bash
     # Instalar ngrok (se ainda não tiver)
     brew install ngrok  # Mac
     # ou baixe de https://ngrok.com/download
     
     # Iniciar túnel para localhost:3000
     ngrok http 3000
     
     # Copie a URL (ex: https://abc123.ngrok.io)
     # Configure no painel Appmax: https://abc123.ngrok.io/api/webhooks/appmax
     ```

#### Passo B: Fazer uma compra de teste

```bash
# 1. Faça checkout Appmax (cartão aprovado ou PIX pago)

# 2. A Appmax enviará webhook para sua URL configurada

# 3. Verifique os logs do servidor:
# [appmax][webhook] 📥 Received
# [appmax][webhook] ✅ Updated transaction
# [appmax][webhook] ✅ Created early transaction (se não existia)

# 4. Verifique no banco:
SELECT provider, hook_id, provider_event_id, type, status, processed, 
       retry_count, received_at, processing_error
FROM webhook_events
WHERE LOWER(provider) = 'appmax'
ORDER BY received_at DESC
LIMIT 50;

# 5. Acesse a página:
# http://localhost:3000/business/payments/webhooks
# Deve aparecer o webhook recebido
```

---

## Estrutura de dados criada

### `customer_subscriptions`

```sql
{
  "id": "cuid...",
  "customer_id": "...",          -- de Customer (orchestration)
  "merchant_id": "...",
  "product_id": "...",
  "offer_id": null,
  "provider": "APPMAX",
  "account_id": "...",           -- merchant.id
  "is_native": true,
  "provider_subscription_id": null,  -- será preenchido se Appmax enviar ID externo
  "status": "TRIAL" | "ACTIVE",  -- baseado em trialDays
  "start_at": "2025-11-19T...",
  "trial_ends_at": "2025-12-19T..." | null,
  "current_period_start": "2025-11-19T...",
  "current_period_end": "2025-12-19T...",  -- calculado por interval
  "price_cents": 300000,
  "currency": "BRL",
  "metadata": {
    "interval": "MONTH",
    "intervalCount": 1,
    "buyerName": "João Teste",
    "buyerEmail": "joao@exemplo.com",
    "productName": "Subscription Product",
    "source": "appmax_checkout",
    "appmaxOrderId": 65486
  }
}
```

### `payment_transactions` (já existia)

```sql
{
  "id": "...",
  "provider": "appmax",
  "provider_order_id": "65486",
  "customer_subscription_id": "cuid...",  -- NOVO: link para subscription
  "status": "paid",
  "amount_cents": 300000,
  ...
}
```

### `webhook_events` (já existia)

```sql
{
  "id": "...",
  "provider": "appmax",
  "hook_id": "65486",           -- orderId da Appmax
  "provider_event_id": "65486",
  "type": "order.paid",         -- event type da Appmax
  "status": "aprovado",         -- status raw
  "raw": { ... },               -- payload completo do webhook
  "processed": true,
  "received_at": "2025-11-19T..."
}
```

---

## Monitoramento

### Queries úteis

#### Subscriptions ativas por provider
```sql
SELECT provider, status, COUNT(*) as total
FROM customer_subscriptions
GROUP BY provider, status
ORDER BY provider, status;
```

#### Subscriptions por produto
```sql
SELECT p.name, cs.status, COUNT(*) as total
FROM customer_subscriptions cs
JOIN products p ON p.id = cs.product_id
WHERE cs.provider = 'APPMAX'
GROUP BY p.name, cs.status
ORDER BY total DESC;
```

#### Webhooks recebidos (últimas 24h)
```sql
SELECT provider, type, COUNT(*) as total
FROM webhook_events
WHERE received_at > NOW() - INTERVAL '24 hours'
GROUP BY provider, type
ORDER BY provider, total DESC;
```

#### Subscriptions próximas do fim do trial
```sql
SELECT cs.id, c.email, p.name, cs.trial_ends_at,
       EXTRACT(days FROM (cs.trial_ends_at - NOW())) as days_left
FROM customer_subscriptions cs
JOIN customers c ON c.id = cs.customer_id
JOIN products p ON p.id = cs.product_id
WHERE cs.status = 'TRIAL'
  AND cs.trial_ends_at IS NOT NULL
  AND cs.trial_ends_at > NOW()
  AND cs.trial_ends_at < NOW() + INTERVAL '7 days'
ORDER BY cs.trial_ends_at ASC;
```

---

## Arquivos modificados

1. `src/app/api/checkout/appmax/create/route.ts`
   - Adicionado bloco de criação de `customer_subscriptions` (linhas 329-425)
   - Detecta `product.type === 'SUBSCRIPTION'`
   - Calcula períodos e status
   - Vincula subscription ao payment_transaction

2. `prisma/schema.prisma`
   - Corrigido mapeamento de `CustomerProvider` (customer_id, account_id, etc)

3. `scripts/run-prisma-generate.js`
   - Novo script para rodar `prisma validate && prisma generate`

---

## Próximos Passos

### ✅ Implementado
- [x] Criar `customer_subscriptions` no checkout Appmax
- [x] Vincular subscription ao `payment_transaction`
- [x] Calcular períodos e status corretamente
- [x] Persistir metadata completo

### ⏳ Pendente (requer ação manual)
- [ ] **Configurar URL do webhook no painel Appmax** (ver "Teste 2" acima)
  - Sandbox: `https://<ngrok-url>/api/webhooks/appmax`
  - Produção: `https://seu-dominio.com/api/webhooks/appmax`

### 🔮 Future (opcional)
- [ ] Worker para processar renovações (quando `current_period_end` expirar)
- [ ] Worker para cobrar trial-to-paid (quando `trial_ends_at` expirar)
- [ ] Adicionar UNIQUE constraint em `customer_subscriptions` para evitar duplicatas
- [ ] Webhook handler para atualizar `provider_subscription_id` se Appmax enviar

---

## Referências

- **Webhook endpoint**: `src/app/api/webhooks/appmax/route.ts`
- **Página de subscriptions**: `src/app/(authenticated)/business/subscriptions/page.tsx`
- **API de subscriptions**: `src/app/api/subscriptions/route.ts`
- **Página de webhooks**: `src/app/(authenticated)/business/payments/webhooks/page.tsx`
- **Schema**: `prisma/schema.prisma` (models `CustomerSubscription`, `Customer`, `products`)

---

**Última atualização**: 19 de Novembro de 2025  
**Autor**: Payment Orchestration Team
