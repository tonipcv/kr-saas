# ✅ VaultManager - Implementação Completa

## 🎯 O que foi implementado

### 1. Service Layer (VaultManager)
**Arquivo**: `src/lib/payments/vault/manager.ts`

Classe centralizada para gerenciar cartões salvos:
- ✅ `saveCard()`: Salva token com fingerprint e deduplicação
- ✅ `listCards()`: Lista cartões por customer
- ✅ `charge()`: Cobra com cartão salvo (delega para gateway adapter)

### 2. Gateway Adapters
**Arquivos**:
- `src/lib/payments/vault/gateways/types.ts` - Interface comum
- `src/lib/payments/vault/gateways/stripe.ts` - Stripe adapter
- `src/lib/payments/vault/gateways/pagarme.ts` - Pagarme adapter
- `src/lib/payments/vault/gateways/appmax.ts` - Appmax adapter

Cada adapter implementa `chargeWithSavedCard()`:
- ✅ **Stripe**: `paymentIntents.create({ off_session: true })`
- ✅ **Pagarme**: `pagarmeCreateOrder({ card_id })`
- ✅ **Appmax**: `paymentsCreditCard({ token })`

### 3. API Routes
**Arquivos**:
- `src/app/api/payments/cards/save/route.ts` - Salvar cartão
- `src/app/api/payments/charge/route.ts` - Cobrar com cartão salvo

#### POST /api/payments/cards/save
```json
{
  "userId": "user_123",
  "slug": "clinic-slug",
  "provider": "STRIPE|PAGARME|APPMAX",
  "token": "pm_xxx|card_xxx|tok_xxx",
  "brand": "visa",
  "last4": "4242",
  "expMonth": 12,
  "expYear": 2025,
  "setAsDefault": true
}
```

#### POST /api/payments/charge
```json
{
  "customerId": "cust_123",
  "savedCardId": "cpm_456",
  "amountCents": 9900,
  "currency": "BRL",
  "description": "Cobrança teste",
  "metadata": { "productId": "prod_789" }
}
```

### 4. Integração com Checkout Appmax
**Arquivo**: `src/app/api/checkout/appmax/create/route.ts`

Modificado para salvar token automaticamente quando `saveCard=true`:
```typescript
if (ccToken && body.saveCard && unifiedCustomerId) {
  const vaultManager = new VaultManager()
  await vaultManager.saveCard({
    customerId: unifiedCustomerId,
    provider: 'APPMAX',
    token: ccToken,
    accountId: merchant.id,
    brand: tokResp?.brand,
    last4: tokResp?.last4,
    expMonth: card?.month,
    expYear: card?.year,
    setAsDefault: true
  })
}
```

### 5. Integração com Trigger.dev (Renovação Appmax)
**Arquivo**: `trigger/renewal-jobs/appmax.ts`

Modificado para buscar token de `customer_payment_methods`:
```typescript
const paymentMethod = await prisma.customerPaymentMethod.findFirst({
  where: {
    customerId: subscription.customerId,
    provider: 'APPMAX',
    status: 'active'
  },
  orderBy: { isDefault: 'desc' }
})

const appmaxCardToken = paymentMethod.providerPaymentMethodId
```

## 📋 Arquivos Criados/Modificados

### Criados (8 arquivos)
1. `src/lib/payments/vault/manager.ts`
2. `src/lib/payments/vault/gateways/types.ts`
3. `src/lib/payments/vault/gateways/stripe.ts`
4. `src/lib/payments/vault/gateways/pagarme.ts`
5. `src/lib/payments/vault/gateways/appmax.ts`
6. `src/app/api/payments/cards/save/route.ts`
7. `src/app/api/payments/charge/route.ts`
8. `docs/VAULT_EXECUTION_PLAN.md`

### Modificados (2 arquivos)
1. `src/app/api/checkout/appmax/create/route.ts` - Salva token via VaultManager
2. `trigger/renewal-jobs/appmax.ts` - Usa customer_payment_methods

## 🔄 Fluxo Completo por Gateway

### Stripe
1. **Frontend**: Tokeniza com Stripe.js → `pm_xxx`
2. **Backend**: `POST /api/payments/cards/save` com `pm_xxx`
3. **VaultManager**: Salva em `customer_payment_methods`
4. **Cobrança**: `POST /api/payments/charge` → `StripeGateway.chargeWithSavedCard()`
   - Anexa PM ao customer: `paymentMethods.attach()`
   - Cobra: `paymentIntents.create({ off_session: true })`

### Pagarme
1. **Frontend**: Tokeniza → `tok_xxx` (temporário)
2. **Backend**: Cria customer e card permanente → `card_xxx`
3. **Backend**: `POST /api/payments/cards/save` com `card_xxx`
4. **VaultManager**: Salva em `customer_payment_methods`
5. **Cobrança**: `POST /api/payments/charge` → `PagarmeGateway.chargeWithSavedCard()`
   - Cria ordem: `pagarmeCreateOrder({ card_id })`

### Appmax
1. **Frontend**: Envia dados do cartão
2. **Backend Checkout**: Tokeniza → `tok_xxx`
3. **Backend Checkout**: Se `saveCard=true`, salva via `VaultManager`
4. **Renovação**: Task busca token de `customer_payment_methods`
5. **Cobrança**: `AppmaxGateway.chargeWithSavedCard()`
   - Cria ordem + cobra: `paymentsCreditCard({ token })`

## 🧪 Como Testar

### 1. Appmax (via Checkout)
```bash
# 1. Criar checkout com saveCard=true
curl -X POST http://localhost:3000/api/checkout/appmax/create \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_123",
    "slug": "clinic-slug",
    "buyer": {
      "name": "João Silva",
      "email": "joao@example.com",
      "document": "12345678900"
    },
    "method": "card",
    "card": {
      "number": "4111111111111111",
      "cvv": "123",
      "month": 12,
      "year": 2025,
      "name": "JOAO SILVA"
    },
    "saveCard": true
  }'

# 2. Verificar cartão salvo
curl http://localhost:3000/api/payments/saved-cards?userId=USER_ID&slug=clinic-slug

# 3. Simular renovação (forçar vencimento no DB)
UPDATE customer_subscriptions 
SET current_period_end = NOW() - INTERVAL '1 day'
WHERE id = 'sub_123';

# 4. Rodar task manualmente no Trigger.dev dashboard
# ou aguardar scheduler diário às 09:00 BRT
```

### 2. Stripe (via API)
```bash
# 1. Tokenizar no frontend com Stripe.js
const { paymentMethod } = await stripe.createPaymentMethod({
  type: 'card',
  card: cardElement
});

# 2. Salvar no backend
curl -X POST http://localhost:3000/api/payments/cards/save \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "slug": "clinic-slug",
    "provider": "STRIPE",
    "token": "pm_1A2B3C4D",
    "brand": "visa",
    "last4": "4242",
    "expMonth": 12,
    "expYear": 2025,
    "setAsDefault": true
  }'

# 3. Cobrar com cartão salvo
curl -X POST http://localhost:3000/api/payments/charge \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "savedCardId": "cpm_456",
    "amountCents": 9900,
    "currency": "BRL",
    "description": "Teste Stripe off_session"
  }'
```

### 3. Pagarme (via API)
```bash
# 1. Criar customer e card no Pagarme (via checkout existente)
# Isso já salva em customer_payment_methods

# 2. Cobrar com cartão salvo
curl -X POST http://localhost:3000/api/payments/charge \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "savedCardId": "cpm_789",
    "amountCents": 9900,
    "currency": "BRL",
    "description": "Teste Pagarme card_id"
  }'
```

## 🔐 Segurança

### Fingerprinting
Cada cartão salvo tem um `fingerprint` único por gateway:
```typescript
fingerprint = base64(`${provider}|${brand}|${last4}|${expMonth}|${expYear}`)
```

Isso previne duplicatas e permite:
- Atualizar token se cartão já existe
- Detectar múltiplos cartões do mesmo número

### PCI Compliance
- ✅ Nunca armazenamos `number` ou `cvv` completos
- ✅ Apenas tokens dos gateways (`pm_xxx`, `card_xxx`, `tok_xxx`)
- ✅ Tokens são específicos por merchant (`accountId`)

## 📊 Database Schema (Já Existe)

```sql
-- customer_payment_methods
CREATE TABLE customer_payment_methods (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  provider "PaymentProvider" NOT NULL,
  account_id TEXT,
  provider_payment_method_id TEXT, -- pm_xxx, card_xxx, tok_xxx
  brand TEXT,
  last4 TEXT,
  exp_month INTEGER,
  exp_year INTEGER,
  fingerprint TEXT,
  is_default BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- customer_provider (para customer_id dos gateways)
CREATE TABLE customer_provider (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  provider "PaymentProvider" NOT NULL,
  provider_customer_id TEXT NOT NULL, -- cus_xxx, customer_xxx, customer_id
  account_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🚀 Próximos Passos

### Testes E2E
- [ ] Appmax: checkout → salvar → renovar
- [ ] Stripe: API → salvar → cobrar off_session
- [ ] Pagarme: API → salvar → cobrar com card_id

### Deploy
- [ ] Configurar env vars:
  - `STRIPE_SECRET_KEY`
  - `PAGARME_API_KEY`
  - `APPMAX_ACCESS_TOKEN` (via merchant_integration)
- [ ] Deploy Trigger.dev (promover versão)
- [ ] Validar schedulers ativos (09:00 BRT)

### Observabilidade (Opcional)
- [ ] Adicionar contadores no `billing-renewal.ts`
- [ ] Slack alert se taxa de falha > 10%
- [ ] Dashboard de cartões salvos por gateway

## ✅ Status Final

**Implementação**: 100% completa
**Arquivos**: 8 criados, 2 modificados
**Gateways**: Stripe ✅ | Pagarme ✅ | Appmax ✅
**APIs**: Save ✅ | Charge ✅ | List ✅ (já existia)
**Integração**: Checkout ✅ | Renewal ✅

**Próximo**: Testes E2E e deploy
