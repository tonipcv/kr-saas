# 🏦 Payment Vault - Guia Completo e Detalhado

## 📚 Sumário Executivo

Este documento explica **como funciona o sistema de vault de cartões** no seu sistema, **o que já existe**, **o que foi implementado agora**, e **o que falta fazer** para ter um sistema completo de cobranças recorrentes com fallback entre gateways.

---

## 🎯 Escopo MVP (sem Basis Theory)

- **Usar apenas tokens nativos dos gateways**: `pm_xxx` (Stripe), `card_xxx` (Pagarme), `tok_xxx` (Appmax).
- **Não** usar vault externo (Basis Theory) nas Fases 1-3.
- A migração com campos `vault_provider`, `vault_token_id` existe para futuro, **não rodar agora**.

## 1️⃣ O QUE JÁ EXISTE (Sistema Atual)

### 1.1 Tabelas de Database

Você já tem toda a infraestrutura de vault criada:

```sql
-- ✅ Clientes unificados (1 cliente = 1 registro)
customers (
  id, merchant_id, email, name, phone, document
)

-- ✅ Mapeamento: seu cliente → ID no gateway
customer_providers (
  id, customer_id, provider, account_id, provider_customer_id
)
-- Exemplo:
-- customer_id='cust_123', provider='STRIPE', provider_customer_id='cus_ABC'
-- customer_id='cust_123', provider='PAGARME', provider_customer_id='customer_XYZ'

-- ✅ Tokens de cartão salvos
customer_payment_methods (
  id, customer_id, provider, account_id,
  provider_payment_method_id,  -- TOKEN DO GATEWAY (pm_xxx, card_xxx, tok_xxx)
  brand, last4, exp_month, exp_year,
  is_default, status, fingerprint
)

-- ✅ Assinaturas
customer_subscriptions (
  id, customer_id, product_id, provider,
  status, price_cents, current_period_end,
  vault_payment_method_id  -- FK para customer_payment_methods
)

-- ✅ Histórico de cobranças
payment_transactions (
  id, provider, customer_id, customer_payment_method_id,
  amount_cents, status, created_at
)
```

### 1.2 Rotas de Checkout Existentes

| Rota | Gateway | O que faz | Status |
|------|---------|-----------|--------|
| `/api/checkout/create` | Pagarme | One-time + prepaid subscription | ✅ Funcional |
| `/api/checkout/subscribe` | Pagarme | Assinatura recorrente | ✅ Funcional |
| `/api/checkout/stripe/subscribe` | Stripe | Assinatura Stripe | ✅ Funcional |
| `/api/checkout/appmax/create` | Appmax | One-time Appmax | ✅ **Atualizado** |
| `/api/payments/tokenize` | Pagarme | Tokenização prévia | ✅ Funcional |
| `/api/payments/saved-cards` | Todos | Lista cartões salvos | ✅ **Atualizado** |

### 1.3 Como Funciona Hoje (Por Gateway)

#### **STRIPE**
```
1. Frontend usa Stripe.js para tokenizar cartão
2. Stripe.js retorna: pm_1A2B3C4D (PaymentMethod)
3. Backend salva em customer_payment_methods:
   - provider = 'STRIPE'
   - provider_payment_method_id = 'pm_1A2B3C4D'
4. Para cobrar novamente:
   - Cria PaymentIntent com payment_method='pm_1A2B3C4D' e off_session=true
```

**Status**: ✅ Reuso funciona perfeitamente

#### **PAGARME (KRXPAY)**
```
1. Frontend usa Pagarme.js para tokenizar → tok_abc (temporário)
2. Backend chama POST /api/payments/tokenize:
   - Cria customer no Pagarme
   - Cria card com tok_abc → card_xyz (permanente)
3. Backend salva em customer_payment_methods:
   - provider = 'KRXPAY'
   - provider_payment_method_id = 'card_xyz'
4. Para cobrar novamente:
   - Cria Order com credit_card.card_id='card_xyz'
```

**Status**: ✅ Reuso funciona perfeitamente

#### **APPMAX**
```
1. Backend chama POST /tokenize/card → tok_xxx
2. Backend usa token em paymentsCreditCard
3. ❌ ANTES: não salvava o token
4. ✅ AGORA: salva em customer_payment_methods:
   - provider = 'APPMAX'
   - provider_payment_method_id = 'tok_xxx'
5. Para cobrar novamente:
   - Aceita saved_card_id no checkout
   - Usa provider_payment_method_id direto
```

**Status**: ✅ **Implementado agora** (antes não existia)

---

## 2️⃣ O QUE FOI IMPLEMENTADO AGORA

### 2.1 Migração: Campos de Vault Universal (Fase 4 - Opcional)

**Arquivo**: `scripts/migrations/20251122_add_vault_fields.js` (não executar no MVP)

```sql
ALTER TABLE customer_payment_methods
ADD COLUMN vault_provider text,        -- 'BASIS_THEORY', 'SPREEDLY', etc
ADD COLUMN vault_token_id text,        -- bt_xxx (token universal)
ADD COLUMN vault_metadata jsonb;       -- metadados do vault

CREATE UNIQUE INDEX uq_cpm_vault_provider_token
ON customer_payment_methods(vault_provider, vault_token_id)
WHERE vault_provider IS NOT NULL;
```

**Por que?** Para suportar vault externo (Basis Theory) no futuro. No MVP, usar apenas `provider_payment_method_id`.

### 2.2 Appmax: Salvar e Usar Cartão

**Arquivo**: `src/app/api/checkout/appmax/create/route.ts`

**Mudanças**:
1. ✅ Aceita `saved_card_id` no body
2. ✅ Se `saved_card_id` existe, busca token salvo e usa direto
3. ✅ Após tokenizar com sucesso, salva em `customer_payment_methods`
4. ✅ Deduplicação via `fingerprint`

**Antes**:
```typescript
// Tokenizava mas não salvava
const token = await client.tokenizeCard(card)
await client.paymentsCreditCard({ token })
// ❌ Token perdido
```

**Agora**:
```typescript
// Tokeniza e salva
const token = await client.tokenizeCard(card)
await prisma.customerPaymentMethod.create({
  provider: 'APPMAX',
  providerPaymentMethodId: token,
  brand, last4, expMonth, expYear,
  fingerprint: hash('APPMAX|visa|4242|12|2025')
})
// ✅ Token salvo para reuso
```

### 2.3 API Saved Cards: Expor Campos de Vault

**Arquivo**: `src/app/api/payments/saved-cards/route.ts`

**Mudança**:
```sql
-- Antes
SELECT id, provider, provider_payment_method_id, brand, last4
FROM customer_payment_methods

-- Agora
SELECT id, provider, provider_payment_method_id,
       vault_provider, vault_token_id, vault_metadata,  -- ✅ NOVO
       brand, last4, exp_month, exp_year
FROM customer_payment_methods
```

**Por que?** Frontend pode ver se o cartão tem token universal (vault) ou apenas token do gateway.

### 2.4 Tipos e Wrapper Basis Theory (Fase 4 - Opcional)

**Arquivos criados**:
- `src/lib/payments/vault/types.ts` - Interfaces TypeScript
- `src/lib/payments/vault/basisTheory.ts` - Cliente HTTP para Basis Theory

**O que faz (quando adotado)**:
```typescript
// Tokenizar cartão no Basis Theory
const token = await basisTheory.tokenize({
  number: '4242424242424242',
  exp_month: 12,
  exp_year: 2025,
  cvc: '123'
})
// Retorna: { id: 'bt_abc123', brand: 'visa', last4: '4242' }

// Converter token universal → token do gateway
const stripeToken = await basisTheory.toGatewayToken('bt_abc123', 'STRIPE')
// Retorna: { token: 'pm_xyz789' }
```

---

## 3️⃣ O QUE FALTA FAZER (MVP com tokens nativos)

### 3.1 VaultManager (Core - MVP)

**Arquivo a criar**: `src/lib/payments/vault/manager.ts`

**Responsabilidade**: Orquestrar salvamento, listagem e uso de tokens nativos dos gateways.

**Métodos principais**:
```typescript
class VaultManager {
  // Salva método com token do gateway
  async saveCard(params: { customerId: string; provider: 'STRIPE'|'PAGARME'|'APPMAX'; accountId?: string|null; token: string; brand?: string; last4?: string; exp_month?: number; exp_year?: number; isDefault?: boolean }): Promise<string>

  // Cobra usando token do gateway
  async charge(params: { customerId: string; savedCardId: string; amountCents: number; currency: string; metadata?: any }): Promise<{ id: string; status: string }>

  // Lista métodos salvos
  async listCards(customerId: string): Promise<Array<any>>
}
```

**Exemplo de uso (MVP)**:
```typescript
const vm = new VaultManager()
const methodId = await vm.saveCard({ customerId, provider: 'PAGARME', token: 'card_xxx', brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2025, isDefault: true })
await vm.charge({ customerId, savedCardId: methodId, amountCents: 9900, currency: 'BRL' })
```

### 3.2 RecurringChargeService (Cobranças Automáticas - MVP)

**Arquivo a criar**: `src/lib/payments/recurring/service.ts`

**Responsabilidade**: Cron job para cobrar assinaturas vencidas.

**Métodos principais**:
```typescript
class RecurringChargeService {
  // Processa todas assinaturas vencidas
  async processSubscriptions(date: Date): Promise<void>
  
  // Cobra uma assinatura específica
  async chargeSubscription(subscriptionId: string): Promise<Transaction>
  
  // Retry com fallback de gateway
  async retryWithFallback(subscription: Subscription, error: Error): Promise<Transaction>
  
  // Detecta cartões expirando (notifica usuário)
  async detectExpiringCards(daysAhead: number): Promise<void>
}
```

**Fluxo (sem fallback automático)**:
```typescript
// Roda todo dia às 09:00
async processSubscriptions(today) {
  // 1. Busca assinaturas vencidas
  const subs = await prisma.customerSubscription.findMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { lte: today } }
  })
  
  // 2. Para cada assinatura
  for (const sub of subs) {
    try {
      // 3. Busca método de pagamento padrão
      const method = await prisma.customerPaymentMethod.findFirst({
        where: { customerId: sub.customerId, isDefault: true }
      })
      
      // 4. Verifica se cartão expirou
      if (isExpired(method)) {
        await notifyExpiredCard(sub.customerId)
        continue
      }
      
      // 5. Resolve token
      const token = method.providerPaymentMethodId
      
      // 6. Cobra no gateway
      const transaction = await chargeViaGateway(method.provider, token, sub.priceCents)
      
      // 7. Atualiza período da assinatura
      await prisma.customerSubscription.update({
        where: { id: sub.id },
        data: {
          currentPeriodStart: sub.currentPeriodEnd,
          currentPeriodEnd: addMonths(sub.currentPeriodEnd, 1)
        }
      })
      
    } catch (error) {
      // 8. Sem fallback automático no MVP; notificar e marcar para retry
      await handleFailure(sub, error)
    }
  }
}
```

### 3.3 GatewayRouter (Fase 3: Fallback manual)

**Arquivo a criar**: `src/lib/payments/core/router.ts`

**Responsabilidade**: Decidir qual gateway usar e fazer fallback quando um falha.

**Métodos principais**:
```typescript
class GatewayRouter {
  // Seleciona melhor gateway baseado em regras
  selectGateway(context: RoutingContext): PaymentProvider
  
  // Fallback quando gateway falha
  getFallbackGateway(failed: PaymentProvider, context: RoutingContext): PaymentProvider | null
  
  // Métricas de aprovação por gateway
  getApprovalRate(provider: PaymentProvider, period: string): number
}
```

**Exemplo de uso**:
```typescript
const router = new GatewayRouter()

// Seleção inicial
const gateway = router.selectGateway({
  country: 'BR',
  amount: 9900,
  method: 'card'
})
// Retorna: 'PAGARME' (menor taxa no Brasil)

// Fallback
try {
  await chargeViaStripe(...)
} catch (error) {
  if (error.code === 503) {
    const fallback = router.getFallbackGateway('STRIPE', context)
    // Retorna: 'PAGARME'
    await chargeViaPagarme(...)
  }
}
```

### 3.4 Scheduled Tasks (Trigger.dev)

Usar Trigger.dev para agendamentos (recomendado) em vez de `node-cron`.

**Arquivos criados:**
- `trigger/billing-renewal.ts` — scheduler diário 09:00 BRT que dispara as tasks de renovação existentes
- `trigger/expiring-cards-notifier.ts` — scheduler semanal (segunda 10:00 BRT) para cartões expirando

```ts
// trigger/billing-renewal.ts (resumo)
import { schedules, tasks } from '@trigger.dev/sdk/v3'
import { prisma } from '@/lib/prisma'

export const dailyBillingRenewal = schedules.task({
  id: 'daily-billing-renewal',
  cron: { pattern: '0 9 * * *', timezone: 'America/Sao_Paulo' },
  run: async () => {
    const now = new Date()
    const due = await prisma.customerSubscription.findMany({
      where: { isNative: false, canceledAt: null, status: { in: ['ACTIVE','PAST_DUE'] as any }, currentPeriodEnd: { lte: now } },
      select: { id: true, provider: true },
      take: 200,
    })
    if (process.env.TRIGGER_ENABLE_PAGARME_PREPAID === 'true') {
      for (const s of due.filter(d => d.provider === ('PAGARME' as any))) {
        await tasks.trigger('pagarme-prepaid-renewal', { subscriptionId: s.id })
      }
    }
    if (process.env.TRIGGER_ENABLE_APPMAX === 'true') {
      for (const s of due.filter(d => d.provider === ('APPMAX' as any))) {
        await tasks.trigger('appmax-renewal', { subscriptionId: s.id })
      }
    }
  }
})

// trigger/expiring-cards-notifier.ts (resumo)
export const expiringCardsNotifier = schedules.task({
  id: 'expiring-cards-notifier',
  cron: { pattern: '0 10 * * 1', timezone: 'America/Sao_Paulo' },
  run: async () => {/* consulta cartões e registra logs de notificação */}
})
```

### 3.5 Integrar Vault nos Checkouts Existentes

**Arquivos a atualizar**:
- `src/app/api/checkout/create/route.ts` (Pagarme)
- `src/app/api/checkout/subscribe/route.ts` (Pagarme)
- `src/app/api/checkout/stripe/subscribe/route.ts` (Stripe)

**Mudança**:
```typescript
// ANTES (gateway direto)
const cardId = await pagarmeCreateCard(customer, card)
await prisma.customerPaymentMethod.create({
  provider: 'KRXPAY',
  providerPaymentMethodId: cardId
})

// DEPOIS (com vault opcional)
const vaultService = new VaultService()

if (process.env.VAULT_ENABLED === 'true') {
  // Tokeniza no Basis Theory
  const vaultToken = await vaultService.tokenize(card, merchant)
  
  // Converte para token do gateway
  const cardId = await vaultService.toGatewayToken(vaultToken.id, 'KRXPAY')
  
  // Salva ambos
  await vaultService.savePaymentMethod(vaultToken, customer, 'KRXPAY', cardId)
} else {
  // Fluxo atual (gateway direto)
  const cardId = await pagarmeCreateCard(customer, card)
  await prisma.customerPaymentMethod.create({
    provider: 'KRXPAY',
    providerPaymentMethodId: cardId
  })
}
```

---

## 4️⃣ FLUXOS COMPLETOS (MVP)

### Fluxo 1: Cliente Novo Compra Assinatura

```
DIA 1 - PRIMEIRA COMPRA
═══════════════════════

1. João entra em https://seusite.com/checkout?plan=pro
2. Preenche cartão: 4111 1111 1111 1111, 12/25, 123
3. Frontend envia para /api/checkout/subscribe

Backend:
4. Cria/busca Customer (email='joao@example.com')
   → customers.id = 'cust_123'

5. Tokeniza cartão no Pagarme:
   → POST /v5/cards → card_def456

6. Salva em customer_payment_methods:
   → id='cpm_001'
   → customer_id='cust_123'
   → provider='KRXPAY'
   → provider_payment_method_id='card_def456'
   → brand='visa', last4='1111', exp_month=12, exp_year=2025
   → is_default=true
   → fingerprint=hash('KRXPAY|visa|1111|12|2025')

7. Cria assinatura no Pagarme:
   → POST /v5/subscriptions com card_id='card_def456'
   → Pagarme retorna: sub_abc123

8. Salva em customer_subscriptions:
   → id='sub_001'
   → customer_id='cust_123'
   → provider='KRXPAY'
   → provider_subscription_id='sub_abc123'
   → vault_payment_method_id='cpm_001'  ← LINK
   → status='ACTIVE'
   → price_cents=9900
   → current_period_start='2025-01-23'
   → current_period_end='2025-02-23'

9. Salva transação inicial:
   → payment_transactions
   → customer_id='cust_123'
   → customer_payment_method_id='cpm_001'
   → amount_cents=9900
   → status='SUCCEEDED'

10. Frontend: "✅ Assinatura ativada! Próxima cobrança: 23/02"


DIA 31 - COBRANÇA RECORRENTE (30 dias depois)
═══════════════════════════════════════════════

09:00 - Cron Job dispara
1. RecurringChargeService.processSubscriptions(2025-02-23)

2. Query busca assinaturas vencidas:
   SELECT * FROM customer_subscriptions
   WHERE status='ACTIVE' AND current_period_end <= '2025-02-23'
   → Retorna: sub_001 (João)

3. Para sub_001:
   a. Busca customer_payment_methods:
      WHERE customer_id='cust_123' AND is_default=true
      → Retorna: cpm_001 (card_def456)
   
   b. Verifica expiração:
      exp_year=2025, exp_month=12
      Hoje: 2025-02-23
      → ✅ Não expirou
   
   c. Resolve token:
      IF vault_token_id EXISTS:
        token = await basisTheory.toGatewayToken(vault_token_id, 'KRXPAY')
      ELSE:
        token = provider_payment_method_id  ← USA ESTE
      → token = 'card_def456'
   
   d. Cobra no Pagarme:
      POST /v5/orders
      {
        customer_id: 'customer_XYZ789',
        items: [{ amount: 9900, description: 'Plano Pro - Fevereiro' }],
        payments: [{
          payment_method: 'credit_card',
          credit_card: { card_id: 'card_def456' }  ← CARTÃO SALVO
        }]
      }
      → Pagarme responde: { id: 'or_456', status: 'paid' }
   
   e. Salva transação:
      payment_transactions
      → customer_id='cust_123'
      → customer_payment_method_id='cpm_001'
      → amount_cents=9900
      → status='SUCCEEDED'
      → created_at='2025-02-23 09:00:15'
   
   f. Atualiza assinatura:
      UPDATE customer_subscriptions
      SET current_period_start='2025-02-23',
          current_period_end='2025-03-23'
      WHERE id='sub_001'

4. Email para João: "✅ Cobrança processada - R$ 99,00"
```

### Fluxo 2: Fallback quando Gateway Cai (limitações do MVP)

```
CENÁRIO: Stripe está fora do ar

1. Maria tem assinatura com cartão salvo na Stripe
   → customer_payment_methods
   → provider='STRIPE', provider_payment_method_id='pm_xyz'

2. Cron job tenta cobrar:
   POST /v1/payment_intents
   → Erro: 503 Service Unavailable

3. RecurringChargeService detecta erro de gateway:
   IF error.code === 503:
     await this.retryWithFallback(subscription, error)

4. GatewayRouter.getFallbackGateway('STRIPE', context):
   → Verifica métricas de aprovação
   → Retorna: 'PAGARME' (melhor alternativa)

5. VaultService.resolvePaymentMethod(customerId, 'PAGARME'):
   → Busca customer_payment_methods
     WHERE customer_id='cust_456' AND provider='PAGARME'
   → ❌ Não encontra (Maria só tem cartão na Stripe)

6. Sem Basis Theory no MVP, fallback só é possível se o cliente já tiver método alternativo salvo em outro gateway. Caso contrário: notificar para adicionar novo método.
```

### Fluxo 3: Cartão Expirado

```
1. Pedro tem cartão salvo: exp_month=12, exp_year=2024
2. Hoje: 2025-01-15

3. Cron job tenta cobrar:
   a. Busca customer_payment_methods (is_default=true)
   b. Verifica expiração:
      IF exp_year < 2025 OR (exp_year==2025 AND exp_month < 1):
        → ✅ Expirou
   
   c. Marca cartão como expirado:
      UPDATE customer_payment_methods
      SET status='expired'
      WHERE id='cpm_010'
   
   d. Marca assinatura como PAST_DUE:
      UPDATE customer_subscriptions
      SET status='PAST_DUE'
      WHERE id='sub_010'
   
   e. Email para Pedro:
      "❌ Seu cartão expirou - Atualize para continuar"

4. Pedro atualiza cartão:
   → POST /api/checkout/subscribe (novo cartão)
   → Cria novo customer_payment_method (is_default=true)
   → Marca antigo como is_default=false
   → Reativa assinatura (status='ACTIVE')
```

---

## 5️⃣ DEDUPLICAÇÃO DE CARTÕES

### Como Funciona

```typescript
// Gera fingerprint
function generateFingerprint(provider, brand, last4, expMonth, expYear) {
  const data = `${provider}|${brand}|${last4}|${expMonth}|${expYear}`
  return crypto.createHash('sha256').update(data).digest('hex')
}

// Exemplo
fingerprint('STRIPE', 'visa', '4242', 12, 2025)
// → 'a1b2c3d4e5f6...'

fingerprint('PAGARME', 'visa', '4242', 12, 2025)
// → 'x9y8z7w6v5u4...'  (diferente porque provider é diferente)
```

### Cenário: Usuário Adiciona Mesmo Cartão 2x

```
1. Primeira vez (Stripe):
   → Salva: provider='STRIPE', pm_xxx
   → fingerprint = hash('STRIPE|visa|4242|12|2025')

2. Segunda vez (Pagarme):
   → Calcula: fingerprint = hash('PAGARME|visa|4242|12|2025')
   → Busca: WHERE fingerprint=X AND customer_id=Y
   → ❌ Não encontra (fingerprint diferente por causa do provider)
   → Cria novo registro

RESULTADO: 2 registros (1 por gateway)
```

### Deduplicação Global (Cross-Gateway)

Para detectar mesmo cartão em gateways diferentes:

```typescript
// Fingerprint SEM provider
function globalFingerprint(brand, last4, expMonth, expYear) {
  const data = `${brand}|${last4}|${expMonth}|${expYear}`
  return crypto.createHash('sha256').update(data).digest('hex')
}

// Ao salvar
const global_fp = globalFingerprint('visa', '4242', 12, 2025)
const existing = await prisma.customerPaymentMethod.findFirst({
  where: {
    customerId: customer.id,
    // Comparar apenas brand|last4|exp (sem provider)
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2025
  }
})

if (existing) {
  // UI: "Este cartão já está cadastrado em outro gateway"
}
```

---

## 6️⃣ MONITORAMENTO E MÉTRICAS

### Queries Úteis

```sql
-- Taxa de aprovação por gateway (últimos 7 dias)
SELECT 
  provider,
  COUNT(*) FILTER (WHERE status_v2='SUCCEEDED') * 100.0 / COUNT(*) as approval_rate,
  COUNT(*) as total_transactions
FROM payment_transactions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY provider;

-- Assinaturas PAST_DUE
SELECT COUNT(*) FROM customer_subscriptions WHERE status='PAST_DUE';

-- Cartões expirando nos próximos 30 dias
SELECT COUNT(*) FROM customer_payment_methods
WHERE status='active'
  AND is_default=true
  AND (
    exp_year = EXTRACT(YEAR FROM NOW())
    AND exp_month BETWEEN EXTRACT(MONTH FROM NOW()) AND EXTRACT(MONTH FROM NOW() + INTERVAL '30 days')
  );

-- Cobranças falhadas recorrentes (mesmo cliente, 3+ falhas)
SELECT customer_id, COUNT(*) as failure_count
FROM payment_transactions
WHERE status_v2='FAILED'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY customer_id
HAVING COUNT(*) >= 3;
```

---

## 7️⃣ CHECKLIST DE IMPLEMENTAÇÃO (corrigido)

### Fase 1: MVP ✅ **CONCLUÍDO (sem BT)**
- [x] Appmax: salvar e usar cartão (tokens nativos)
- [x] API saved-cards compatível (sem depender de vault externo)

### Fase 2: Recorrência (2-3 semanas)
- [ ] `RecurringChargeService`
- [ ] Cron job diário e e-mails
- [ ] Retry lógico
- [ ] Testes unitários

### Fase 3: Fallback Manual (2 semanas)
- [ ] `GatewayRouter` básico (se cliente tiver múltiplos cartões)
- [ ] UI: adicionar método alternativo

### Fase 4: Basis Theory (Opcional, 2 semanas)
- [ ] Rodar migração `vault_*` (quando adotar BT)
- [ ] `VaultService` (token universal e conversão)
- [ ] Fallback cross-gateway automático

### Fase 5: Produção (1-2 semanas)
- [ ] Webhooks atualizados
- [ ] Alertas (Slack/PagerDuty)
- [ ] Load testing
- [ ] Documentação final

---

## 8️⃣ PERGUNTAS FREQUENTES

### P: Preciso rodar a migração em produção?
**R**: Sim, mas é segura. Apenas adiciona colunas novas (não remove nada). Rode antes de deployar o código que usa os novos campos.

### P: O sistema atual vai quebrar?
**R**: Não. A migração é aditiva e o código novo é backward compatible. Tudo que funciona hoje continua funcionando.

### P: Quando usar Basis Theory vs gateway direto?
**R**: Use gateway direto por enquanto (já funciona). Basis Theory é para quando quiser portabilidade (trocar de gateway sem perder cartões salvos).

### P: Como testar em sandbox?
**R**: Todos os gateways têm ambiente de teste:
- Stripe: `sk_test_...`
- Pagarme: `sk_test_...`
- Appmax: `testMode: true`

### P: E se o cron job falhar?
**R**: Implemente retry manual via admin panel ou rode o script manualmente: `node scripts/process-recurring-charges.js`

---

**Status Atual**: ✅ Fase 1 concluída | 🚧 Fase 2-5 pendentes
