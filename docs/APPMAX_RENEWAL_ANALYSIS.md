# Análise Completa: Fluxo Appmax (Checkout → Renovação)

## Resumo Executivo

Analisei todo o fluxo desde a compra inicial até a renovação automática. **Encontrei 1 problema crítico** que impede renovações de funcionarem corretamente.

---

## Fluxo Atual

### 1. Checkout Inicial (`/api/checkout/appmax/create`)

**O que funciona:**
- ✅ Cria `customer` unificado (merchant + email)
- ✅ Cria `customer_provider` (APPMAX) com `providerCustomerId` (Appmax customer_id)
- ✅ Tokeniza cartão e salva em `customer_payment_methods` com `accountId = merchant.id`
- ✅ Cria order na Appmax
- ✅ Cobra cartão
- ✅ Cria `customer_subscriptions` com metadata contendo:
  - `interval`, `intervalCount`
  - `buyerName`, `buyerEmail`, `productName`
  - `appmaxOrderId`
  - `source: 'appmax_checkout'`

**❌ PROBLEMA CRÍTICO: `appmaxCustomerId` NÃO é salvo no metadata da subscription**

Linha 397-405 em `src/app/api/checkout/appmax/create/route.ts`:
```typescript
const metadata = JSON.stringify({
  interval,
  intervalCount,
  buyerName: String(buyer.name || ''),
  buyerEmail: String(buyer.email || ''),
  productName: String(product.name || ''),
  source: 'appmax_checkout',
  appmaxOrderId: order_id
  // ❌ FALTA: appmaxCustomerId: customer_id
})
```

### 2. Webhook (`/api/webhooks/appmax`)

**O que funciona:**
- ✅ Atualiza `payment_transactions` quando status muda
- ✅ Cria `customer` e `customer_provider` se não existir (quando paid)
- ✅ Ativa subscription quando payment = 'paid':
  - Muda status para `ACTIVE`
  - Define `current_period_start` e `current_period_end`
- ✅ Cria `purchase` quando paid

**✅ Não precisa salvar `appmaxCustomerId` aqui** (já deveria vir do checkout)

### 3. Renovação (`trigger/renewal-jobs/appmax.ts`)

**O que precisa:**
- `subscription.metadata.appmaxCustomerId` → **❌ NÃO EXISTE**
- `customer.document` → ✅ OK (corrigido via script)
- `customer_payment_methods.accountId = subscription.merchantId` → ✅ OK (corrigido via script)
- Token válido em `customer_payment_methods` → ✅ OK

**Linha 78-82:**
```typescript
const metaCustomerId: string | undefined = meta.appmaxCustomerId;
if (!metaCustomerId) {
  console.warn("⚠️  Missing appmaxCustomerId in metadata. Skipping Appmax renewal.");
  return { skipped: true, reason: "missing_appmax_customer_id" };
}
```

---

## Correção Necessária

### Arquivo: `src/app/api/checkout/appmax/create/route.ts`

**Linha 397-405**, adicionar `appmaxCustomerId`:

```typescript
const metadata = JSON.stringify({
  interval,
  intervalCount,
  buyerName: String(buyer.name || ''),
  buyerEmail: String(buyer.email || ''),
  productName: String(product.name || ''),
  source: 'appmax_checkout',
  appmaxOrderId: order_id,
  appmaxCustomerId: customer_id  // ✅ ADICIONAR ESTA LINHA
})
```

---

## Verificação de Dados Salvos

### Tabela: `customer_subscriptions`

**Campos obrigatórios para renovação:**
- ✅ `customer_id` → vincula ao customer unificado
- ✅ `merchant_id` → identifica o merchant
- ✅ `product_id` → produto da assinatura
- ✅ `provider = 'APPMAX'`
- ✅ `current_period_end` → data de vencimento
- ✅ `price_cents` → valor a cobrar
- ✅ `currency = 'BRL'`
- ✅ `metadata.interval` → unidade do período
- ✅ `metadata.intervalCount` → quantidade de períodos
- ❌ `metadata.appmaxCustomerId` → **FALTANDO**

### Tabela: `customer`

**Campos obrigatórios:**
- ✅ `id` → customer unificado
- ✅ `merchant_id` → merchant owner
- ✅ `email` → email do comprador
- ✅ `name` → nome do comprador
- ✅ `document` → CPF/CNPJ (11 ou 14 dígitos) → **corrigido via script**

### Tabela: `customer_payment_methods`

**Campos obrigatórios:**
- ✅ `customer_id` → vincula ao customer
- ✅ `provider = 'APPMAX'`
- ✅ `provider_payment_method_id` → token do cartão
- ✅ `account_id` → **DEVE = subscription.merchantId** → **corrigido via script**
- ✅ `status = 'ACTIVE'`
- ✅ `brand`, `last4`, `exp_month`, `exp_year`
- ✅ `is_default = true` (para renovação pegar o correto)

### Tabela: `customer_providers`

**Campos obrigatórios:**
- ✅ `customer_id` → customer unificado
- ✅ `provider = 'APPMAX'`
- ✅ `account_id` → merchant.id
- ✅ `provider_customer_id` → Appmax customer_id (criado no checkout)

---

## Fluxo Correto (após correção)

### 1. Checkout
- Cria order na Appmax → retorna `customer_id` (ex: 33480)
- Salva subscription com metadata:
  ```json
  {
    "interval": "MONTH",
    "intervalCount": 1,
    "appmaxCustomerId": "33480",  // ✅ AGORA PRESENTE
    "appmaxOrderId": "65576",
    "source": "appmax_checkout"
  }
  ```

### 2. Webhook (quando paid)
- Ativa subscription (status → ACTIVE)
- Define `current_period_start` e `current_period_end`

### 3. Scheduler (cron diário 09:00)
- Busca subscriptions com `current_period_end <= now`
- Enfileira `appmax-renewal` para cada uma

### 4. Renewal Job
- Lê `subscription.metadata.appmaxCustomerId` → ✅ AGORA EXISTE
- Lê `customer.document` → ✅ OK
- Busca token em `customer_payment_methods` com `accountId = merchantId` → ✅ OK
- Cria order na Appmax
- Cobra com token salvo
- Atualiza subscription se paid

---

## Scripts de Correção

### Para subscriptions existentes (backfill)

Criar `local-scripts/backfill_appmax_customer_id.js`:

```javascript
const { prisma } = require("../dist/lib/prisma.js");

async function main() {
  // Buscar todas subscriptions APPMAX sem appmaxCustomerId no metadata
  const subs = await prisma.customerSubscription.findMany({
    where: {
      provider: 'APPMAX',
      canceledAt: null,
    },
    include: { customer: true },
  });

  let fixed = 0;
  for (const sub of subs) {
    const meta = (sub.metadata && typeof sub.metadata === 'object') ? sub.metadata : {};
    
    // Se já tem, skip
    if (meta.appmaxCustomerId) continue;

    // Buscar customer_provider para pegar o providerCustomerId
    const cp = await prisma.customerProvider.findFirst({
      where: {
        customerId: sub.customerId,
        provider: 'APPMAX',
        accountId: sub.merchantId,
      },
      select: { providerCustomerId: true },
    });

    if (cp?.providerCustomerId) {
      meta.appmaxCustomerId = cp.providerCustomerId;
      await prisma.customerSubscription.update({
        where: { id: sub.id },
        data: { metadata: meta },
      });
      console.log(`✅ Fixed subscription ${sub.id} → appmaxCustomerId: ${cp.providerCustomerId}`);
      fixed++;
    } else {
      console.warn(`⚠️  Subscription ${sub.id} has no customer_provider with Appmax ID`);
    }
  }

  console.log(`\n✅ Fixed ${fixed} subscriptions`);
}

main().finally(() => prisma.$disconnect());
```

---

## Checklist de Validação

Após aplicar a correção, verificar:

- [ ] Checkout salva `appmaxCustomerId` no metadata da subscription
- [ ] Webhook ativa subscription corretamente
- [ ] Renewal job consegue ler `appmaxCustomerId` do metadata
- [ ] Renewal job valida `customer.document` antes de cobrar
- [ ] Renewal job valida `customer_payment_methods.accountId` antes de cobrar
- [ ] Retry de 504 funciona (já implementado)

---

## Arquivos Afetados

### Correção Principal
- `src/app/api/checkout/appmax/create/route.ts` (linha 397-405)

### Scripts de Suporte
- `local-scripts/check_appmax_renewal_prereqs.js` (já existe)
- `local-scripts/fix_appmax_prereqs.js` (já existe)
- `local-scripts/backfill_appmax_customer_id.js` (criar)

### Jobs
- `trigger/renewal-jobs/appmax.ts` (já tem validação e retry 504)
- `trigger/billing-renewal.ts` (scheduler, OK)

---

## Conclusão

**Problema raiz:** O checkout não salva `appmaxCustomerId` no metadata da subscription, causando falha silenciosa na renovação (skip com reason `missing_appmax_customer_id`).

**Solução:** Adicionar 1 linha no checkout para persistir o `customer_id` retornado pela Appmax no metadata da subscription.

**Impacto:** Sem essa correção, **nenhuma renovação Appmax funcionará**, mesmo com todos os outros dados corretos.
