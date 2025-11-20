# Análise Completa: Payment Orchestration System
**Data:** 19 de Novembro de 2024  
**Versão:** 1.0  
**Status:** Sistema em Produção com Orquestração Parcial

---

## 📋 Índice

1. [Resumo Executivo](#resumo-executivo)
2. [Arquitetura Atual do Sistema](#arquitetura-atual-do-sistema)
3. [Análise do Database (Schema)](#análise-do-database-schema)
4. [Análise das Rotas de Checkout](#análise-das-rotas-de-checkout)
5. [Análise dos Payment Providers](#análise-dos-payment-providers)
6. [Análise dos Webhooks](#análise-dos-webhooks)
7. [Erros e Problemas (Crítico → Leve)](#erros-e-problemas)
8. [Acertos e Pontos Fortes](#acertos-e-pontos-fortes)
9. [Gap Analysis: O Que Falta](#gap-analysis)
10. [Roadmap: Sistema Avançado](#roadmap-sistema-avançado)

---

## 📊 Resumo Executivo

### Estado Atual
O sistema implementa um **payment orchestration híbrido** com capacidades de:
- ✅ Multi-provider (Stripe, Pagar.me/KRXPAY, Appmax, Open Finance)
- ✅ Multi-país (Brasil, Internacional)
- ✅ Multi-moeda (BRL, USD, EUR, MXN)
- ✅ Roteamento dinâmico por país/método/oferta
- ✅ Split payments (percentual + flat fee)
- ✅ Assinaturas (plan-based e planless)
- ✅ Webhook processing (sync + async worker)
- ⚠️ Normalização parcial de status
- ⚠️ Customer vault em implementação
- ❌ Retry logic incompleto
- ❌ Cascade/failover ausente

### Maturidade: **Nível 3 de 5**
```
Nível 1: Single provider hardcoded          ❌
Nível 2: Multi-provider com switch manual   ❌
Nível 3: Routing dinâmico + normalização    ✅ (ATUAL)
Nível 4: Smart routing + retry + fallback   ⚠️ (50%)
Nível 5: ML-based routing + auto-healing    ❌
```

### Principais Conquistas
1. **Abstração de Providers**: Interface `PaymentProviderClient` bem definida
2. **Roteamento Inteligente**: Sistema de rules com priority + fallbacks
3. **Dual-write Strategy**: Persistência em tabelas unificadas + provider-specific
4. **Anti-downgrade Protection**: Máquina de estado com transições válidas
5. **Split Payments**: Suporte a híbrido (percentual + taxas fixas)
6. **Webhook Resilience**: Async processing com retry e dead-letter queue

### Principais Gaps
1. **Retry Logic**: Ausente no checkout flow (apenas em webhooks)
2. **Cascade Routing**: Sem failover automático para provider alternativo
3. **Reconciliation**: Sem job de reconciliação automática provider ↔ DB
4. **Observability**: Métricas e alertas limitados
5. **Rate Limiting**: Sem controle de quota por provider
6. **Cost Optimization**: Sem seleção por custo/taxa

---

## 🔧 Análise das Rotas de Checkout

### 1. POST /api/checkout/create (One-Time)
**Status**: ✅ Funcional | ⚠️ Sem retry

**Fluxo**:
```
1. Validação (productId, buyer, payment)
2. Resolve Product → Clinic → Merchant (verifica recipientId)
3. Resolve Offer → OfferPrice (prioriza KRXPAY por país)
4. Calcula installments (Brasil: R$97+ permite parcelar)
5. Aplica juros (Tabela Price) se parcelas > 1
6. selectProvider() - routing dinâmico
7. IF STRIPE: cria PaymentIntent + retorna client_secret
8. IF KRXPAY: cria Order + aplica split + retorna order/pix
9. Persiste payment_transactions (status=processing)
```

**Acertos**:
- ✅ Fallback quando DB offline (usa amountCents do client)
- ✅ Split automático (percentual + flat fee)
- ✅ Validação de recipientId (bloqueia se não configurado)
- ✅ Suporte a cartão salvo (card_id)
- ✅ Anti-fraude (IP, device, billing_address)

**Problemas**:
- ❌ **CRÍTICO**: Sem retry se provider falha (retorna erro direto)
- ❌ **CRÍTICO**: Sem cascade para provider alternativo
- ⚠️ Cálculo de juros fixo (2.99%/mês) - não configurable
- ⚠️ Split desabilitado com cartão salvo (limitação Pagar.me)
- ⚠️ País inferido de buyer.address (pode estar errado)

---

### 2. POST /api/checkout/subscribe (Subscriptions)
**Status**: ✅ Funcional | ⚠️ Complexidade alta

**Modos de Operação**:
1. **Planless** (`USE_PLANLESS=true`): Assinatura avulsa sem plano
2. **Plan-based**: Usa `providerPlanId` do produto

**Fluxo**:
```
1. Valida produto (type=SUBSCRIPTION)
2. Resolve Offer de assinatura
3. IF !planless: Ensure/Create provider plan
4. Dual-write: customers, customer_providers
5. Create customer no provider (pagarmeCreateCustomer)
6. Save card com verify=true (pagarmeCreateCustomerCard)
7. Create subscription (planless ou plan-based)
8. Apply split na 1ª cobrança (retry 15x com 1s interval)
9. Upsert customer_subscriptions
10. Pre-create payment_transactions (status=PROCESSING)
```

**Acertos**:
- ✅ Dual-write strategy (tabelas unificadas)
- ✅ Split em assinaturas (webhook charge.created + apply imediato)
- ✅ Planless mode (flexibilidade)
- ✅ Trial period support
- ✅ Retry agressivo no split (15 tentativas)

**Problemas**:
- ❌ **CRÍTICO**: Delegação condicional confusa (SUBSCRIBE_V1_DELEGATE)
- ❌ **CRÍTICO**: Sem rollback se split falha após criar subscription
- ⚠️ Plan cache pode ficar stale (verifica price, mas não outros campos)
- ⚠️ Só suporta cartão (PIX recorrente via Open Finance não integrado)
- ⚠️ Sem suporte a addons/metered billing

---

### 3. GET /api/checkout/status (Status Query)
**Status**: ✅ Robusto | ✅ Multi-provider

**Lógica de Resolução**:
```
IF id.startsWith('pi_'): # Stripe PaymentIntent
  → Check DB payment_transactions
  → Fallback: Query all active Stripe integrations
  → Return normalized {provider, status, amount_minor, currency}

IF id.startsWith('sub_'): # Pagar.me Subscription
  → Check payment_transactions (pode ter tx de fatura)
  → Check customer_subscriptions (status ACTIVE/TRIAL)
  → Fallback: pagarmeGetSubscription()
  → Prefer subscription status over transaction

ELSE: # Pagar.me Order
  → pagarmeGetOrder()
  → Extract PIX qr_code se disponível
  → Check payment_transactions para normalized data
```

**Acertos**:
- ✅ Normalização consistente cross-provider
- ✅ Fallback inteligente (DB → Provider API)
- ✅ PIX data incluído (qr_code, expires_in)
- ✅ Suporta Appmax (via DB)

**Problemas**:
- ⚠️ Múltiplas queries sequenciais (pode ser lento)
- ⚠️ Não cacheia resultados terminais (paid/failed)

---

## 🔌 Análise dos Payment Providers

### STRIPE (Internacional)
**Implementação**: `lib/providers/stripe/index.ts`  
**Status**: ✅ Completo via abstração

**Métodos Implementados**:
- `createCustomer()` - Cria customer na Stripe
- `createPayment()` - PaymentIntent com auto payment methods
- `capturePayment()` - Captura manual
- `cancelPayment()` - Cancela intent
- `createSubscription()` - Subscription com trial support
- `cancelSubscription()` - Cancela subscription

**Acertos**:
- ✅ Conversão automática de moeda (minor/major units)
- ✅ Zero-decimal currencies (JPY, KRW)
- ✅ Status normalization (`normalizeStripeStatus`)
- ✅ Multi-account support (Stripe Connect)

**Gaps**:
- ❌ Não usa Stripe Checkout Sessions (poderia simplificar)
- ⚠️ Sem webhook handler dedicado (`/api/stripe/webhook` existe mas limitado)

---

### KRXPAY/Pagar.me (Brasil)
**Implementação**: SDK direto + Adapter  
**Status**: ⚠️ Legado sem abstração completa

**Features**:
- ✅ PIX (QR code, expires_in)
- ✅ Cartão (parcelamento até 12x)
- ✅ Boleto
- ✅ Split payments (flat + percentage)
- ✅ Subscriptions (planless + plan-based)
- ✅ Card vault

**Acertos**:
- ✅ Split híbrido (percentual clínica + flat fee plataforma)
- ✅ Webhook robusto (`/api/payments/pagarme/webhook`)
- ✅ Verificação de PIX pago (consulta provider antes de marcar paid)
- ✅ Remediation de IDs (corrige provider_order_id se veio charge_id)

**Problemas**:
- ❌ **CRÍTICO**: Não implementa `PaymentProviderClient` interface
- ❌ SDK calls espalhados (não centralizado)
- ⚠️ Split via env vars (não por merchant_integration)
- ⚠️ Planless vs plan mode confuso (duas lógicas diferentes)

---

### APPMAX (Brasil)
**Status**: ⚠️ Integração parcial

**Suporte**:
- ✅ Webhook handler (`/api/webhooks/appmax`)
- ✅ PIX QR code (base64)
- ✅ Status tracking em payment_transactions

**Gaps**:
- ❌ Não tem create flow (só webhook)
- ❌ Sem abstração PaymentProviderClient

---

### Open Finance (PIX Automático)
**Status**: ⚠️ Em desenvolvimento

**Tabelas**:
- `open_finance_links` - Enrollment (vínculo)
- `open_finance_consents` - Contratos recorrentes
- `openbanking_payments` - Pagamentos executados
- `enrollment_contexts` - Contexto do usuário

**Gaps**:
- ❌ Não integrado ao checkout flow
- ❌ Sem interface PaymentProviderClient

---

## 📡 Análise dos Webhooks

### 1. Pagar.me Webhook (`/api/payments/pagarme/webhook`)
**Status**: ✅ Robusto e completo

**Features**:
- ✅ Signature verification (x-pagarme-signature)
- ✅ Dev mode (aceita sem signature se secret não configurado)
- ✅ Async processing (WEBHOOK_ASYNC=true)
- ✅ Persist raw event (webhook_events)
- ✅ Anti-downgrade protection (SQL CASE)
- ✅ Split em charge.created (subscriptions)
- ✅ Email notifications (paid/canceled/refunded)
- ✅ Backfill de relações (clinic/product/doctor/patient)
- ✅ PIX verification (consulta provider antes de paid)
- ✅ Placeholder rows (webhook antes de create)

**Problemas**:
- ⚠️ Lógica muito extensa (965 linhas)
- ⚠️ Mix de business logic + persistence
- ⚠️ Sem circuit breaker (pode sobrecarregar DB)

---

### 2. Stripe Webhook (`/api/stripe/webhook`)
**Status**: ⚠️ Limitado

**Implementado**:
- ✅ Signature verification
- ⚠️ Apenas payment_intent.succeeded tratado

**Gaps**:
- ❌ Não trata subscription events
- ❌ Não trata invoice events
- ❌ Não atualiza customer_subscriptions

**Nota**: Worker (`webhook-processor.ts`) compensa parcialmente

---

### 3. Webhook Worker (`workers/webhook-processor.ts`)
**Status**: ✅ Bem estruturado

**Lógica**:
```
Loop infinito:
1. SELECT webhooks pendentes (processed=false, next_retry_at <= NOW)
2. FOR UPDATE SKIP LOCKED (concurrency safe)
3. processEvent() por provider
4. Update processed=true OU increment retry_count
5. Dead letter após max_retries
```

**Providers Suportados**:
- ✅ Stripe (payment_intent, charge, invoice, subscription)
- ✅ Pagar.me (order, charge, subscription)

**Acertos**:
- ✅ Concurrency-safe (SKIP LOCKED)
- ✅ Exponential backoff (5min default)
- ✅ Dead letter queue
- ✅ Normalização antes de processar

**Gaps**:
- ❌ Batch size fixo (10) - não auto-scale
- ❌ Não usa real queue (PgBoss importado mas não usado)
- ⚠️ Sleep fixo (1s) mesmo sem trabalho

---

## 🚨 Erros e Problemas (Crítico → Leve)

### 🔴 CRÍTICOS (Bloqueantes para escala)

#### 1. Ausência de Retry Logic no Checkout
**Arquivo**: `src/app/api/checkout/create/route.ts`  
**Problema**: Se o provider retorna erro (timeout, rate limit, downtime), o pagamento falha imediatamente sem tentativa de recuperação.

**Impacto**:
- ❌ Perda de revenue (usuário desiste)
- ❌ Experiência ruim (erro genérico)
- ❌ False negatives (provider intermitente)

**Solução**:
```typescript
// Implementar retry exponencial
const result = await retryWithBackoff(
  () => provider.createPayment(params),
  { maxAttempts: 3, backoffMs: 1000 }
)
```

---

#### 2. Sem Cascade/Failover Automático
**Arquivo**: `src/lib/payments/core/routing.ts`  
**Problema**: `selectProvider()` retorna **um único provider**. Se ele falha, não tenta alternativo.

**Impacto**:
- ❌ SPOF (single point of failure)
- ❌ Downtime do provider = downtime do sistema
- ❌ Não aproveita redundância multi-provider

**Solução**:
```typescript
// Retornar lista ordenada de providers
async function selectProviders(params): Promise<PaymentProvider[]> {
  return [primaryProvider, fallback1, fallback2]
}

// No checkout, iterar até sucesso
for (const provider of providers) {
  try {
    const result = await createPayment(provider, params)
    if (result.success) break
  } catch (err) {
    // Log e continua para próximo
  }
}
```

---

#### 3. Split Payment Sem Rollback
**Arquivo**: `src/app/api/checkout/subscribe/route.ts` (linha ~200-250)  
**Problema**: Cria subscription no provider ANTES de aplicar split. Se split falha, subscription fica órfã.

**Impacto**:
- ❌ Subscription criada sem split (plataforma não recebe)
- ❌ Difícil de reconciliar manualmente
- ❌ Cliente cobrado, mas valor errado distribuído

**Cenário Real**:
```
1. pagarmeCreateSubscription() ✅ Sucesso
2. Apply split (15 retries) ❌ Falha total
3. Result: Subscription ativa SEM split configurado
```

**Solução**:
- Transação compensatória (cancelar subscription se split falha)
- OU: Aplicar split via webhook (mais resiliente)

---

#### 4. Migração Status Schema Incompleta
**Arquivo**: `prisma/schema.prisma` (payment_transactions)  
**Problema**: Coexistência de `status` (String) e `status_v2` (Enum) sem migração clara.

**Impacto**:
- ⚠️ Queries ambíguas (qual campo usar?)
- ⚠️ Inconsistências (status='paid', status_v2=null)
- ⚠️ Complexidade de manutenção

**Código Atual**:
```typescript
// Alguns lugares usam status string
WHERE status = 'paid'

// Outros usam status_v2 enum
WHERE status_v2 = 'SUCCEEDED'
```

**Solução**:
1. Migration: Backfill status_v2 de todos registros
2. Deprecar status (String)
3. Renomear status_v2 → status

---

#### 5. Pagar.me Sem Interface Abstrata
**Arquivo**: `src/lib/providers/pagarme/legacy.ts`  
**Problema**: Lógica de Pagar.me não implementa `PaymentProviderClient`.

**Impacto**:
- ❌ Dificulta troca de provider
- ❌ Não consegue usar factory pattern
- ❌ Duplicação de lógica (webhook vs create)

**Solução**:
```typescript
export class PagarmeProvider implements PaymentProviderClient {
  async createPayment(params) { /* ... */ }
  async createSubscription(params) { /* ... */ }
  // etc
}
```

---

### 🟡 IMPORTANTES (Afetam operação)

#### 6. Reconciliation Manual
**Problema**: Não há job automático para reconciliar DB ↔ Provider.

**Cenários Não Cobertos**:
- Webhook perdido (network failure)
- Status mudou no provider mas DB não atualizou
- Provider criou charge mas DB não tem registro

**Solução**:
```typescript
// Cron job diário
async function reconcileTransactions(since: Date) {
  // 1. Buscar txs "processing" > 24h
  // 2. Query provider API
  // 3. Update se status diverge
  // 4. Alert se discrepância crítica
}
```

---

#### 7. Email Notifications Inline
**Arquivo**: `src/app/api/payments/pagarme/webhook/route.ts` (linha ~800)  
**Problema**: Envia emails síncronos no webhook handler.

**Impacto**:
- ⚠️ Webhook pode timeout (Resend lento)
- ⚠️ Provider reenvia webhook (duplicate)
- ⚠️ Sem retry se email falha

**Solução**:
- Enqueue email jobs (PgBoss/BullMQ)
- Webhook só persiste, worker envia email

---

#### 8. Hardcoded Split Rules
**Arquivo**: `src/app/api/checkout/create/route.ts`  
**Problema**: Split % via env vars (`PLATFORM_FEE_PERCENTAGE`, `FLAT_FEE_CENTS`).

**Impacto**:
- ❌ Não suporta split dinâmico por merchant
- ❌ Mudança requer redeploy
- ❌ Não suporta promoções (0% fee temporário)

**Solução**:
```typescript
// Armazenar em merchant_integrations.config
const split = await prisma.merchantIntegration.findUnique({
  where: { merchantId_provider: { merchantId, provider } },
  select: { config: true }
})
const platformFee = split.config.platformFeePercentage || 10
```

---

#### 9. Plan Cache Sem TTL
**Arquivo**: `src/app/api/checkout/subscribe/route.ts`  
**Problema**: Cache de plans (ProductIntegration) nunca invalida.

**Impacto**:
- ⚠️ Mudança de preço não reflete
- ⚠️ Pode usar plano desativado
- ⚠️ Dificulta debugging

**Solução**:
- TTL de 1 hora no cache
- OU: Invalidar cache ao atualizar produto

---

#### 10. Webhook Events Sem Retention
**Arquivo**: `webhook_events` table  
**Problema**: Tabela cresce indefinidamente (nunca deleta).

**Impacto**:
- 💾 Storage crescente
- 🐌 Queries lentas (full table scan)
- 💸 Custo de storage

**Solução**:
```sql
-- Cron job mensal
DELETE FROM webhook_events
WHERE processed = true
  AND received_at < NOW() - INTERVAL '90 days'
```

---

### 🟢 LEVES (Melhorias de qualidade)

#### 11. País Inferido de Address
**Arquivo**: `src/app/api/checkout/create/route.ts`  
**Problema**: País vem de `buyer.address.country` (pode estar errado ou ausente).

**Solução**:
- Usar IP geolocation como fallback
- Validar country contra lista ISO-3166

---

#### 12. Installments Hardcoded
**Arquivo**: `src/app/api/checkout/create/route.ts`  
**Problema**: Lógica de parcelas fixa:
- Min R$97 para parcelar
- Juros fixo 2.99%/mês
- Max 12 parcelas

**Solução**:
- Configurar por produto/merchant
- Tabela `installment_rules` com min/max/rate

---

#### 13. Currency em String
**Arquivo**: `payment_transactions.currency`  
**Problema**: Campo String permite valores inválidos.

**Solução**:
```prisma
enum Currency {
  BRL
  USD
  EUR
  MXN
  // etc
}
```

---

#### 14. Logs Sem Structured Logging
**Problema**: console.log sem contexto estruturado.

**Solução**:
```typescript
logger.info('payment.created', {
  provider, orderId, amountCents, merchantId
})
```

---

#### 15. Sem Rate Limiting
**Problema**: Nenhum controle de quota por provider.

**Impacto**:
- Pode exceder limites (Stripe: 100 req/s)
- Sem alertas de consumo

**Solução**:
- Implementar token bucket por provider
- Alertar quando > 80% quota

---

## ✅ Acertos e Pontos Fortes

### 🏆 Arquitetura

#### 1. Interface PaymentProviderClient
**Arquivo**: `lib/providers/base.ts`  
**Acerto**: Abstração limpa que permite trocar providers sem impacto.

```typescript
interface PaymentProviderClient {
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerOutput>
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput>
  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionOutput>
  // etc
}
```

**Benefícios**:
- ✅ Facilita A/B testing de providers
- ✅ Reduz vendor lock-in
- ✅ Testes unitários mais fáceis (mock)

---

#### 2. Routing Engine Flexível
**Arquivo**: `src/lib/payments/core/routing.ts`  
**Acerto**: `selectProvider()` com hierarquia de fallbacks bem pensada.

**Lógica**:
```
1. BR + (CARD|PIX) → KRXPAY (internal, menor custo)
2. offer.preferredProvider (se configurado)
3. PaymentRoutingRule (offer > product > merchant)
4. Default por país (BR→KRXPAY, Other→STRIPE)
5. Primeira integração ativa (last resort)
```

**Benefícios**:
- ✅ Controle granular (por oferta)
- ✅ A/B testing via priority
- ✅ Graceful degradation

---

#### 3. Dual-Write Strategy
**Arquivo**: `src/app/api/checkout/subscribe/route.ts`  
**Acerto**: Persiste em tabelas unificadas E no provider.

```typescript
// 1. Create no provider
const pagarmeCustomer = await pagarmeCreateCustomer(...)

// 2. Persist local
await prisma.customer.create({
  data: { merchantId, email, ... }
})

// 3. Link provider
await prisma.customerProvider.create({
  data: { customerId, provider: 'KRXPAY', providerCustomerId }
})
```

**Benefícios**:
- ✅ Customer unificado cross-provider
- ✅ Troca de provider sem perder histórico
- ✅ Queries locais (sem API call)

---

#### 4. Anti-Downgrade Protection
**Arquivo**: `lib/queue/pgboss.ts` (linha ~273)  
**Acerto**: SQL CASE que impede regressão de status.

```sql
SET status = CASE
  WHEN status = 'pending' AND $1 IN ('processing','paid') THEN $1
  WHEN status = 'processing' AND $1 = 'paid' THEN $1
  WHEN status = 'paid' AND $1 IN ('refunded','chargedback') THEN $1
  ELSE status  -- Mantém atual se inválido
END
```

**Benefícios**:
- ✅ Webhooks fora de ordem não quebram
- ✅ Estado sempre monotônico
- ✅ Sem race conditions

---

#### 5. Split Payment Híbrido
**Arquivo**: `src/lib/providers/pagarme/legacy.ts`  
**Acerto**: Suporta percentual + flat fee simultaneamente.

```typescript
splitRules: [
  {
    type: 'flat',
    amount: FLAT_FEE_CENTS,
    recipient_id: platformRecipientId
  },
  {
    type: 'percentage',
    percentage: platformPercentage * 100,
    recipient_id: platformRecipientId
  }
]
```

**Benefícios**:
- ✅ Modelo de pricing flexível
- ✅ Garante mínimo (flat) + variável (%)

---

#### 6. Webhook Resilience
**Arquivo**: `workers/webhook-processor.ts`  
**Acerto**: Async processing com retry e DLQ.

**Features**:
- ✅ Idempotência (unique provider+hook_id)
- ✅ Retry exponencial (3x default)
- ✅ Dead letter queue (moved_dead_letter)
- ✅ Concurrency-safe (FOR UPDATE SKIP LOCKED)

---

#### 7. Planless Subscriptions
**Arquivo**: `src/app/api/checkout/subscribe/route.ts`  
**Acerto**: Não depende de planos pré-cadastrados.

**Benefícios**:
- ✅ Flexibilidade de pricing
- ✅ Trial customizado por customer
- ✅ Sem overhead de gerenciar planos

---

#### 8. PIX Verification
**Arquivo**: `src/app/api/payments/pagarme/webhook/route.ts`  
**Acerto**: Consulta provider antes de marcar PIX como paid.

```typescript
if (event.type === 'order.paid' && paymentMethod === 'pix') {
  const verifyOrder = await pagarmeGetOrder(orderId)
  if (verifyOrder.status !== 'paid') {
    return // Aguarda próximo webhook
  }
}
```

**Benefícios**:
- ✅ Previne falsos positivos
- ✅ Evita fraude (webhook spoofing)

---

#### 9. Checkout Session Tracking
**Arquivo**: `checkout_sessions` table  
**Acerto**: Rastreamento completo do funil.

**Dados Capturados**:
- Attribution (UTM params)
- Behavior (heartbeat, last_step)
- Device (IP, userAgent)
- Intent (selected_installments, method)

**Benefícios**:
- ✅ Analytics de conversão
- ✅ Cart recovery
- ✅ Fraud detection

---

#### 10. Multi-Currency Support
**Arquivo**: `offer_prices` table  
**Acerto**: Preços específicos por país/moeda/provider.

**Benefícios**:
- ✅ Pricing localizado
- ✅ Compensa custos diferentes por provider
- ✅ A/B testing de preço por região

---

## 📊 Gap Analysis: O Que Falta

### Comparativo: Atual vs Avançado

| Feature | Atual | Sistema Avançado | Prioridade |
|---------|-------|------------------|------------|
| **Retry Logic** | ❌ Ausente | ✅ 3 tentativas exponencial | 🔴 Alta |
| **Cascade Routing** | ❌ Single provider | ✅ Failover automático | 🔴 Alta |
| **Reconciliation** | ❌ Manual | ✅ Cron diário automático | 🟡 Média |
| **Rate Limiting** | ❌ Nenhum | ✅ Token bucket por provider | 🟡 Média |
| **Cost Routing** | ❌ Não considera | ✅ Rota por menor custo | 🟢 Baixa |
| **Smart Routing** | ⚠️ Regras estáticas | ✅ ML-based (taxa aprovação) | 🟢 Baixa |
| **3DS Support** | ⚠️ Stripe apenas | ✅ Todos providers | 🟡 Média |
| **Tokenization** | ⚠️ Parcial | ✅ Network tokens (Visa/MC) | 🟢 Baixa |
| **Fraud Detection** | ⚠️ Provider-side | ✅ Agregado + scoring | 🟡 Média |
| **A/B Testing** | ⚠️ Manual (priority) | ✅ % split automático | 🟢 Baixa |
| **Observability** | ❌ Logs básicos | ✅ Métricas + traces | 🟡 Média |
| **Subscription Dunning** | ❌ Ausente | ✅ Retry automático failed | 🔴 Alta |
| **Refund Workflow** | ⚠️ API manual | ✅ UI + approval flow | 🟡 Média |
| **Chargeback Handling** | ❌ Nenhum | ✅ Alert + representment | 🟡 Média |
| **Multi-Account** | ⚠️ Stripe Connect | ✅ Todos providers | 🟢 Baixa |

---

### Features Ausentes (Críticas)

#### 1. Retry Logic com Circuit Breaker
**O Que Falta**:
```typescript
class PaymentRetrier {
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(options.provider)
    
    if (circuitBreaker.isOpen()) {
      throw new Error('Circuit breaker open')
    }
    
    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        const result = await fn()
        circuitBreaker.recordSuccess()
        return result
      } catch (error) {
        if (!this.isRetryable(error)) throw error
        circuitBreaker.recordFailure()
        
        if (attempt === options.maxAttempts) throw error
        await this.backoff(attempt, options.backoffMs)
      }
    }
  }
}
```

**Benefícios**:
- Reduz falhas intermitentes em 80%+
- Protege provider de overload
- Melhora UX (transparente para usuário)

---

#### 2. Cascade Routing
**O Que Falta**:
```typescript
async function processPaymentWithFallback(params: PaymentParams) {
  const providers = await selectProviders(params) // [primary, fallback1, fallback2]
  const errors: Error[] = []
  
  for (const provider of providers) {
    try {
      const result = await createPaymentWithRetry(provider, params)
      
      // Log qual provider foi usado
      await analytics.track('payment.provider_used', {
        provider,
        isPrimary: provider === providers[0],
        attemptNumber: errors.length + 1
      })
      
      return result
    } catch (error) {
      errors.push(error)
      
      // Continua para próximo provider
      await analytics.track('payment.provider_failed', {
        provider,
        error: error.message,
        willRetry: errors.length < providers.length
      })
    }
  }
  
  // Todos falharam
  throw new AggregateError(errors, 'All payment providers failed')
}
```

**Benefícios**:
- SLA 99.9%+ (vs 99% single provider)
- Reduz downtime em 90%
- Aproveita uptime agregado

---

#### 3. Subscription Dunning
**O Que Falta**:
```typescript
// Cron job diário
async function processDunning() {
  const failedSubs = await prisma.customerSubscription.findMany({
    where: {
      status: 'PAST_DUE',
      lastRetryAt: { lt: subDays(new Date(), 1) },
      retryCount: { lt: 3 }
    }
  })
  
  for (const sub of failedSubs) {
    try {
      // Tenta cobrar novamente
      const result = await retrySubscriptionCharge(sub)
      
      if (result.success) {
        await prisma.customerSubscription.update({
          where: { id: sub.id },
          data: { status: 'ACTIVE', retryCount: 0 }
        })
        
        // Email: Pagamento recuperado
        await sendEmail('subscription.recovered', sub)
      } else {
        await prisma.customerSubscription.update({
          where: { id: sub.id },
          data: { 
            retryCount: { increment: 1 },
            lastRetryAt: new Date()
          }
        })
        
        // Email: Falha, atualize cartão
        if (sub.retryCount >= 2) {
          await sendEmail('subscription.final_warning', sub)
        }
      }
    } catch (error) {
      // Log e continua
    }
  }
}
```

**Benefícios**:
- Recupera 30-40% de subscriptions failed
- Reduz churn involuntário
- Melhora MRR

---

#### 4. Reconciliation Automática
**O Que Falta**:
```typescript
async function reconcileTransactions(since: Date) {
  const pendingTxs = await prisma.paymentTransaction.findMany({
    where: {
      status: { in: ['processing', 'pending'] },
      createdAt: { lt: subHours(new Date(), 24) }
    }
  })
  
  for (const tx of pendingTxs) {
    const providerStatus = await queryProviderStatus(tx)
    
    if (providerStatus !== tx.status) {
      await prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { 
          status: providerStatus,
          reconciledAt: new Date()
        }
      })
      
      await alert.send('payment.reconciled', {
        txId: tx.id,
        oldStatus: tx.status,
        newStatus: providerStatus
      })
    }
  }
}
```

**Benefícios**:
- Detecta webhooks perdidos
- Sincroniza estado divergente
- Evita under/over charging

---

### Features Ausentes (Importantes)

#### 5. Observability (Métricas)
**O Que Falta**:
- Success rate por provider
- Latência P50/P95/P99
- Error rate por tipo
- Cost per transaction
- Conversion rate por provider

**Stack Sugerida**:
- Prometheus (métricas)
- Grafana (dashboards)
- Sentry (errors)
- Datadog/New Relic (APM)

---

#### 6. Smart Routing (ML-based)
**O Que Falta**:
```typescript
interface RoutingFeatures {
  cardBIN: string          // Primeiros 6 dígitos
  country: string
  amountCents: number
  timeOfDay: number        // 0-23
  dayOfWeek: number        // 0-6
  customerLifetimeValue: number
  previousDeclines: number
}

async function selectProviderML(features: RoutingFeatures): Promise<PaymentProvider> {
  // Modelo treinado com histórico de aprovações
  const predictions = await mlModel.predict(features)
  
  // Retorna provider com maior probabilidade de aprovação
  return predictions.sort((a, b) => b.approvalRate - a.approvalRate)[0].provider
}
```

**Benefícios**:
- Aumenta aprovação em 5-15%
- Reduz custo (rota para mais barato quando possível)
- Aprende com histórico

---

#### 7. Fraud Scoring
**O Que Falta**:
```typescript
interface FraudSignals {
  isVPN: boolean
  deviceFingerprint: string
  emailDomain: string      // Hotmail vs empresa
  billingAddressMatch: boolean
  velocityCheck: number    // Txs última hora
  cardCountryMismatch: boolean
}

async function calculateFraudScore(signals: FraudSignals): Promise<number> {
  let score = 0
  
  if (signals.isVPN) score += 20
  if (!signals.billingAddressMatch) score += 30
  if (signals.velocityCheck > 3) score += 40
  if (signals.cardCountryMismatch) score += 25
  
  return Math.min(score, 100)
}

// No checkout
const fraudScore = await calculateFraudScore(signals)
if (fraudScore > 70) {
  // Requer 3DS ou bloqueia
}
```

---

#### 8. Refund Management
**O Que Falta**:
- UI para solicitar refund
- Workflow de aprovação (manager)
- Partial refunds
- Refund analytics (reason, rate)
- Auto-refund em casos específicos

---

#### 9. Webhook Replay/Debug
**O Que Falta**:
```typescript
// Admin route
POST /api/admin/webhooks/replay
{
  "eventId": "wh_abc123",
  "provider": "stripe"
}

// Reprocessa webhook específico
async function replayWebhook(eventId: string) {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: eventId }
  })
  
  await processEvent(event.raw)
}
```

---

### Features Ausentes (Nice to Have)

#### 10. Payment Links
Gerar link de pagamento shareable (sem checkout form).

#### 11. Saved Payment Methods UI
Interface para customer gerenciar cartões salvos.

#### 12. Invoice Generation
PDF de fatura com QR code (PIX) e boleto.

#### 13. Multi-Currency Auto Conversion
Converter preço baseado em taxa do dia (API cambio).

#### 14. Subscription Upgrades/Downgrades
Trocar plano com proration.

#### 15. Webhook Simulator (Dev)
Mock de webhooks para testes locais.

---

## 🚀 Roadmap: Sistema Avançado

### Fase 1: Estabilização (1-2 meses) 🔴

**Objetivo**: Eliminar problemas críticos

1. **Implementar Retry Logic**
   - ✅ Exponential backoff (3 tentativas)
   - ✅ Circuit breaker por provider
   - ✅ Timeout configurável
   - **Esforço**: 1 semana

2. **Adicionar Cascade Routing**
   - ✅ `selectProviders()` retorna array
   - ✅ Loop com fallback
   - ✅ Analytics de qual provider usado
   - **Esforço**: 1 semana

3. **Migrar Status Schema**
   - ✅ Backfill `status_v2` para todos registros
   - ✅ Atualizar queries para usar `status_v2`
   - ✅ Deprecar `status` (String)
   - **Esforço**: 3 dias

4. **Abstrair Pagar.me**
   - ✅ Implementar `PagarmeProvider implements PaymentProviderClient`
   - ✅ Centralizar SDK calls
   - ✅ Remover código duplicado
   - **Esforço**: 2 semanas

5. **Subscription Dunning**
   - ✅ Cron job diário
   - ✅ Retry failed charges (3x)
   - ✅ Email notifications
   - **Esforço**: 1 semana

**Total**: 5-6 semanas

---

### Fase 2: Confiabilidade (2-3 meses) 🟡

**Objetivo**: Operação hands-off

1. **Reconciliation Automática**
   - ✅ Cron job diário (txs > 24h pending)
   - ✅ Query provider status
   - ✅ Update divergências
   - ✅ Alertas Slack/Email
   - **Esforço**: 1 semana

2. **Observability**
   - ✅ Prometheus metrics
   - ✅ Grafana dashboards (success rate, latency, cost)
   - ✅ Sentry error tracking
   - ✅ Custom alerts (>5% error rate)
   - **Esforço**: 2 semanas

3. **Rate Limiting**
   - ✅ Token bucket por provider
   - ✅ Queue quando limite excedido
   - ✅ Alert 80% quota
   - **Esforço**: 3 dias

4. **Split Rules Dinâmicos**
   - ✅ Migrar de env vars para `merchant_integrations.config`
   - ✅ UI para configurar split %
   - ✅ Histórico de mudanças
   - **Esforço**: 1 semana

5. **Webhook Retention**
   - ✅ Cron job mensal (delete > 90 dias)
   - ✅ Archive para S3 antes de deletar
   - **Esforço**: 2 dias

6. **Email Queue**
   - ✅ Enqueue emails via PgBoss
   - ✅ Worker separado
   - ✅ Retry failed sends
   - **Esforço**: 3 dias

**Total**: 4-5 semanas

---

### Fase 3: Otimização (3-4 meses) 🟢

**Objetivo**: Maximizar conversão e reduzir custos

1. **Cost-Based Routing**
   - ✅ Armazenar taxa por provider (merchant_integrations)
   - ✅ Calcular custo estimado
   - ✅ Preferir mais barato quando possível
   - **Esforço**: 1 semana

2. **Smart Routing (ML)**
   - ✅ Coletar features (BIN, country, amount, hour)
   - ✅ Treinar modelo (histórico aprovações)
   - ✅ Endpoint de predição
   - ✅ A/B test vs routing atual
   - **Esforço**: 4 semanas

3. **Fraud Scoring**
   - ✅ Device fingerprinting
   - ✅ Velocity checks
   - ✅ Score agregado (0-100)
   - ✅ 3DS obrigatório se > 70
   - **Esforço**: 2 semanas

4. **Network Tokenization**
   - ✅ Integrar Visa/Mastercard network tokens
   - ✅ Aumenta aprovação ~3%
   - **Esforço**: 2 semanas

5. **Refund Management**
   - ✅ Admin UI
   - ✅ Approval workflow
   - ✅ Partial refunds
   - ✅ Analytics
   - **Esforço**: 2 semanas

**Total**: 11 semanas

---

### Fase 4: Features Avançados (4-6 meses) 🔵

**Objetivo**: Diferenciais competitivos

1. **Payment Links**
   - ✅ Gerar link shareable
   - ✅ Customizar expiração
   - ✅ Track conversions
   - **Esforço**: 1 semana

2. **Invoice System**
   - ✅ PDF generation
   - ✅ QR code (PIX)
   - ✅ Boleto bancário
   - ✅ Email delivery
   - **Esforço**: 2 semanas

3. **Customer Portal**
   - ✅ Gerenciar cartões
   - ✅ Ver histórico de pagamentos
   - ✅ Download invoices
   - ✅ Cancelar subscription
   - **Esforço**: 3 semanas

4. **Subscription Management**
   - ✅ Upgrade/downgrade
   - ✅ Proration
   - ✅ Pause/resume
   - ✅ Add-ons
   - **Esforço**: 3 semanas

5. **Multi-Currency Auto Conversion**
   - ✅ API de câmbio (exchangerate.host)
   - ✅ Auto-convert preços
   - ✅ Cache rates (1 dia)
   - **Esforço**: 1 semana

6. **Chargeback Management**
   - ✅ Webhook de chargeback
   - ✅ Alert imediato
   - ✅ Representment workflow
   - ✅ Evidence upload
   - **Esforço**: 2 semanas

**Total**: 12 semanas

---

## 📈 Métricas de Sucesso

### KPIs Atuais (Baseline)
- **Success Rate**: ~95% (estimado)
- **Latency P95**: Desconhecido
- **Downtime**: Acoplado a provider
- **Churn Rate**: Desconhecido
- **MRR Recovery**: 0% (sem dunning)

### KPIs Alvo (Pós-Roadmap)
- **Success Rate**: >98% (retry + cascade)
- **Latency P95**: <2s
- **Uptime**: 99.9% (multi-provider)
- **Churn Rate**: -30% (dunning)
- **MRR Recovery**: +35% (dunning)
- **Cost per Transaction**: -15% (routing otimizado)

---

## 🎯 Conclusão

### Estado Atual: **Nível 3 de 5**
O sistema atual é **funcional e robusto** para operação básica, com excelente foundation:
- ✅ Multi-provider architecture
- ✅ Dual-write strategy
- ✅ Webhook resilience
- ✅ Anti-downgrade protection
- ✅ Split payments

### Gaps Críticos
1. **Retry logic** - Perda de revenue
2. **Cascade routing** - SPOF
3. **Subscription dunning** - Churn alto
4. **Reconciliation** - Risco de divergências

### Próximos Passos (Fase 1)
1. Implementar retry com circuit breaker (1 semana)
2. Adicionar cascade routing (1 semana)
3. Migrar status schema (3 dias)
4. Abstrair Pagar.me (2 semanas)
5. Implementar dunning (1 semana)

**Timeline**: 5-6 semanas para eliminar problemas críticos

### Visão de Longo Prazo
Com o roadmap completo (6 meses), o sistema alcançará **Nível 5**:
- 🤖 ML-based routing
- 🛡️ Fraud detection avançado
- 💰 Cost optimization
- 📊 Observability completa
- 🔄 Auto-healing
- 🚀 99.9% uptime

---

**Documento gerado em**: 19 de Novembro de 2024  
**Responsável**: Payment Orchestration Team  
**Próxima Revisão**: Após Fase 1 (Janeiro 2025)

