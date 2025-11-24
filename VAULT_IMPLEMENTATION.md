# 🏦 Payment Vault - Documento de Implementação

> Objetivo: MVP com tokens nativos dos gateways (Stripe, Pagarme, Appmax) e reuso para cobranças recorrentes. Sem Basis Theory na Fase 1-3.

> Importante (MVP):
> - Usar apenas `provider_payment_method_id` (pm_xxx, card_xxx, tok_xxx).
> - Não usar nem depender de vault externo agora.
> - A migração de campos `vault_*` existe, mas deve ser aplicada apenas na Fase 4 (opcional). Não executar em Fase 1-3.

---

## 📊 Sistema Atual

### Tabelas Existentes

```sql
customers                    -- Clientes unificados
customer_providers          -- Mapeamento cliente → provedor
customer_payment_methods    -- TOKENS dos gateways
customer_subscriptions      -- Assinaturas
payment_transactions        -- Histórico de cobranças
```

### Rotas de Checkout

| Rota | Provedor | Status |
|------|----------|--------|
| `/api/checkout/create` | KRXPAY | ✅ Funcional |
| `/api/checkout/subscribe` | KRXPAY | ✅ Funcional |
| `/api/checkout/stripe/subscribe` | STRIPE | ✅ Funcional |
| `/api/checkout/appmax/create` | APPMAX | ✅ **Atualizado com vault** |
| `/api/payments/tokenize` | KRXPAY | ✅ Funcional |
| `/api/payments/saved-cards` | ALL | ✅ **Atualizado** |

### Fluxo Atual por Gateway

**STRIPE**: `pm_xxx` (PaymentMethod) → Reuso via `off_session: true` ✅

**PAGARME**: `tok_xxx` → `card_xxx` (permanente) → Reuso via `card_id` ✅

**APPMAX**: `tok_xxx` → Reuso **implementado agora** ✅

---

## 🎯 Arquitetura Proposta (MVP)

### Componentes Novos

```
VaultManager           → Salvar/usar tokens nativos dos gateways (sem BT)
RecurringChargeService → Cron job para cobranças automáticas
GatewayRouter          → Seleção e fallback (apenas se houver múltiplos cartões do cliente)
```

### Database: Campos Vault (Fase 4 - Opcional)

Nota: A migração `scripts/migrations/20251122_add_vault_fields.js` só deve ser usada na Fase 4, caso adote Basis Theory. No MVP, usar apenas `provider_payment_method_id`.

### Schema Atualizado (MVP)

```typescript
customer_payment_methods {
  // Token do gateway (MVP)
  provider_payment_method_id: string  // pm_xxx, card_xxx, tok_xxx

  // Metadados não sensíveis
  brand, last4, exp_month, exp_year
  fingerprint  // deduplicação
}
```

---

## 🔄 Fluxos de Implementação

### 1. Primeira Compra (Salvar Cartão) — MVP tokens nativos

#### Gateway Path (Atual - Manter)
```
Frontend → Tokeniza no gateway → Token
Backend → Salva em customer_payment_methods
       → provider_payment_method_id = token
       → vault_provider = NULL
```

#### Vault Path (Novo - Feature Flag)
```
Frontend → Cartão
Backend → IF VAULT_ENABLED:
            BasisTheory.tokenize() → bt_xxx
            Salva vault_token_id = bt_xxx
          ELSE:
            Fluxo atual (gateway direto)
```

### 2. Cobrança Recorrente

```
Cron Job (diário 09:00)
  → RecurringChargeService.processSubscriptions()
  → Para cada assinatura vencida:
      1. Busca customer_payment_methods (is_default=true)
      2. Verifica expiração
      3. Resolve token:
         - Se vault_token_id: converte via BT.proxy()
         - Senão: usa provider_payment_method_id
      4. Tenta cobrar
      5. Se falha: retry com fallback de gateway
```

### 3. Fallback entre Gateways (limitação do MVP)

```
Stripe down (503)
  → GatewayRouter.getFallbackGateway('STRIPE')
  → Retorna 'PAGARME'
  → Busca customer_payment_methods WHERE provider='PAGARME'
  → Se não encontra:
      - Converte vault_token via BT.proxy('PAGARME')
      - Cria novo customer_payment_method
  → Retry cobrança via Pagarme
```

### 4. Deduplicação de Cartões

```
fingerprint = hash(provider|brand|last4|exp_month|exp_year)

Ao salvar:
  1. Calcula fingerprint
  2. Busca WHERE fingerprint = X AND customer_id = Y
  3. Se encontra: atualiza registro existente
  4. Senão: cria novo
```

---

## 🛠️ Guia de Desenvolvimento

### Passo 1: Rodar Migração

**Não executar agora**. A migração `scripts/migrations/20251122_add_vault_fields.js` só deve ser usada na Fase 4, caso adote Basis Theory.

### Passo 2: Implementar VaultManager (MVP)

Interface mínima (MVP): salvar, listar e cobrar com tokens nativos dos gateways.

```typescript
export class VaultManager {
  async savePaymentMethod(token: string, customer: Customer): Promise<string>
  async listPaymentMethods(customerId: string): Promise<PaymentMethod[]>
  async chargePaymentMethod(paymentMethodId: string): Promise<Transaction>
}
```

### Passo 3: Atualizar Checkout Routes (sem BT)

**Appmax**: ✅ Já implementado  
**Pagarme** (MVP)
 vault.tokenize() após criar card  
**Stripe** (MVP)
 vault.tokenize() após criar PaymentMethod

### Passo 4: Implementar RecurringChargeService

**Arquivo**: `src/lib/payments/recurring/service.ts`

```typescript
export class RecurringChargeService {
  async processSubscriptions(date: Date): Promise<void>
  async chargeSubscription(subscriptionId: string): Promise<Transaction>
  async retryWithFallback(subscription: Subscription): Promise<Transaction>
}
```

### Passo 5: Agendamentos (Trigger.dev)

Usar Trigger.dev para os jobs recorrentes. Arquivos:
- `trigger/billing-renewal.ts` — diário 09:00 BRT, dispara tasks de renovação
- `trigger/expiring-cards-notifier.ts` — segunda 10:00 BRT, cartões expirando

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
```

---

## 🧪 Testes

### Teste 1: Salvar Cartão (Appmax)
```
POST /api/checkout/appmax/create
{ card: {...}, buyer: {...} }

Verificar:
✓ customer_payment_methods criado
✓ provider_payment_method_id preenchido
✓ fingerprint gerado
```

### Teste 2: Usar Cartão Salvo
```
POST /api/checkout/appmax/create
{ saved_card_id: "cpm_xxx", buyer: {...} }

Verificar:
✓ Não tokeniza novamente
✓ Usa provider_payment_method_id existente
✓ Cobrança aprovada
```

### Teste 3: Cobrança Recorrente
```
1. Criar assinatura
2. Aguardar vencimento (ou forçar data)
3. Rodar cron job
4. Verificar payment_transactions criado
5. Verificar subscription.currentPeriodEnd atualizado
```

### Teste 4: Fallback de Gateway
```
1. Desligar Stripe (mock 503)
2. Rodar cobrança recorrente
3. Verificar fallback para Pagarme
4. Verificar transaction.routed_provider = 'PAGARME'
```

---

## 📅 Roadmap de Rollout (corrigido)

### Fase 1: MVP (Semana 1-2)
- [x] Appmax: salvar e usar cartão (tokens nativos)
- [x] API saved-cards expor apenas campos do gateway (mantido compatível)
- [x] Documentação dos fluxos (sem BT)

### Fase 2: Recorrência (Semana 3-4)
- [ ] RecurringChargeService
- [ ] Cron job diário e notificações
- [ ] Retry lógico (sem fallback automático)

### Fase 3: Fallback Manual (Semana 5-6)
- [ ] UI para adicionar cartão alternativo em outro gateway
- [ ] GatewayRouter básico (tentar outro cartão do cliente se existir)

### Fase 4: Basis Theory (Opcional, Semana 7-8)
- [ ] Rodar migração de `vault_*` (scripts/migrations/20251122_add_vault_fields.js)
- [ ] VaultService (token universal e conversão)
- [ ] Fallback cross-gateway automático
- [ ] Portabilidade total de tokens

---

## 🔐 Segurança e Compliance

### PCI DSS
✅ Nunca armazenar PAN/CVV  
✅ Apenas tokens opacos  
✅ Logs sanitizados  
✅ SAQ A (22 requisitos)

### Basis Theory
✅ Level 1 PCI certified  
✅ SOC 2 Type II  
✅ GDPR compliant

---

## 📞 Suporte

**Dúvidas técnicas**: Consultar `/src/lib/payments/vault/types.ts`  
**Testes**: Rodar `npm test -- vault`  
**Logs**: `[vault]`, `[recurring]`, `[gateway-router]`

---

**Status**: ✅ Fase 1 concluída | 🚧 Fase 2 em andamento
