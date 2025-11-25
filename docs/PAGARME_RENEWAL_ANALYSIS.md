# Análise Completa: Fluxo Pagar.me Prepaid (Checkout → Renovação)

## Resumo Executivo

Analisei todo o fluxo desde a compra inicial até a renovação automática. **Encontrei 2 problemas críticos** que impedem renovações de funcionarem corretamente.

---

## Fluxo Atual

### 1. Checkout Inicial (`/api/checkout/create`)

**O que funciona:**
- ✅ Cria `customer` unificado (merchant + email)
- ✅ Cria order na Pagar.me
- ✅ Cobra cartão/PIX
- ✅ Salva card_id em `customer_payment_methods` (quando usa saved card)
- ✅ Cria `customer_subscriptions` com metadata contendo:
  - `interval`, `intervalCount`
  - `buyerName`, `buyerEmail`, `productName`
  - `pagarmeOrderId`
  - `subscriptionPeriodMonths`
  - `source: 'checkout_create_prepaid'`

**❌ PROBLEMAS CRÍTICOS:**

#### Problema 1: `pagarmeCustomerId` NÃO é salvo no metadata

Linhas 1600-1609 em `src/app/api/checkout/create/route.ts`:
```typescript
const metadata = JSON.stringify({
  interval,
  intervalCount,
  buyerName: String(buyer?.name || ''),
  buyerEmail: String(buyer?.email || ''),
  productName: String(productData?.name || ''),
  source: 'checkout_create_prepaid',
  pagarmeOrderId: order.id,
  subscriptionPeriodMonths: subMonths
  // ❌ FALTA: pagarmeCustomerId: order.customer?.id
})
```

#### Problema 2: `pagarmeCardId` NÃO é salvo no metadata

O renewal job precisa do `card_id` da Pagar.me, mas ele não está sendo salvo no metadata da subscription. O job tenta buscar de `customer_payment_methods.providerPaymentMethodId`, mas:
- Esse campo só é preenchido quando usa "saved card" explicitamente
- Na primeira compra, o card_id fica apenas na response do order

**Linha 72 em `trigger/renewal-jobs/pagarme-prepaid.ts`:**
```typescript
const pagarmeCardId: string | undefined = paymentMethod.providerPaymentMethodId || meta.pagarmeCardId;
if (!pagarmeCustomerId || !pagarmeCardId) throw new Error("Missing Pagar.me identifiers in metadata/payment method");
```

### 2. Webhook (`/api/payments/pagarme/webhook`)

**O que funciona:**
- ✅ Atualiza `payment_transactions` quando status muda
- ✅ Aplica split rules quando configurado
- ✅ Sincroniza status do recipient

**❌ NÃO cria/atualiza subscription** (diferente do webhook Appmax)

### 3. Renovação (`trigger/renewal-jobs/pagarme-prepaid.ts`)

**O que precisa:**
- `subscription.metadata.pagarmeCustomerId` → **❌ NÃO EXISTE**
- `subscription.metadata.pagarmeCardId` (fallback) → **❌ NÃO EXISTE**
- `customer_payment_methods.providerPaymentMethodId` (card_id) → ⚠️ Só existe se usou saved card
- `customer.document` → ✅ OK (pode ser preenchido)
- `customer.telephone` → ⚠️ Pode estar vazio

**Linhas 71-73:**
```typescript
const pagarmeCustomerId: string | undefined = meta.pagarmeCustomerId;
const pagarmeCardId: string | undefined = paymentMethod.providerPaymentMethodId || meta.pagarmeCardId;
if (!pagarmeCustomerId || !pagarmeCardId) throw new Error("Missing Pagar.me identifiers in metadata/payment method");
```

---

## Correções Necessárias

### Arquivo: `src/app/api/checkout/create/route.ts`

**Linha 1600-1609**, adicionar `pagarmeCustomerId` e `pagarmeCardId`:

```typescript
// Extract customer_id and card_id from order response
const pagarmeCustomerId = order?.customer?.id || null;
const pagarmeCardId = (() => {
  // Try to get from charge
  const ch = Array.isArray(order?.charges) ? order.charges[0] : null;
  const tx = ch?.last_transaction || null;
  const cardId = tx?.card?.id || null;
  if (cardId) return cardId;
  
  // Fallback: try from payments
  const pay = Array.isArray(order?.payments) ? order.payments[0] : null;
  const payTx = pay?.last_transaction || pay?.transaction || null;
  return payTx?.card?.id || null;
})();

const metadata = JSON.stringify({
  interval,
  intervalCount,
  buyerName: String(buyer?.name || ''),
  buyerEmail: String(buyer?.email || ''),
  productName: String(productData?.name || ''),
  source: 'checkout_create_prepaid',
  pagarmeOrderId: order.id,
  subscriptionPeriodMonths: subMonths,
  pagarmeCustomerId,  // ✅ ADICIONAR
  pagarmeCardId       // ✅ ADICIONAR
})
```

---

## Verificação de Dados Salvos

### Tabela: `customer_subscriptions`

**Campos obrigatórios para renovação:**
- ✅ `customer_id` → vincula ao customer unificado
- ✅ `merchant_id` → identifica o merchant
- ✅ `product_id` → produto da assinatura
- ✅ `provider = 'KRXPAY'` (Pagar.me usa KRXPAY no enum)
- ✅ `current_period_end` → data de vencimento
- ✅ `price_cents` → valor a cobrar
- ✅ `currency = 'BRL'`
- ✅ `metadata.interval` → unidade do período
- ✅ `metadata.intervalCount` → quantidade de períodos
- ❌ `metadata.pagarmeCustomerId` → **FALTANDO**
- ❌ `metadata.pagarmeCardId` → **FALTANDO**

### Tabela: `customer`

**Campos obrigatórios:**
- ✅ `id` → customer unificado
- ✅ `merchant_id` → merchant owner
- ✅ `email` → email do comprador
- ✅ `name` → nome do comprador
- ⚠️ `document` → CPF/CNPJ (11 ou 14 dígitos) → **pode estar vazio**
- ⚠️ `telephone` → telefone → **pode estar vazio**

### Tabela: `customer_payment_methods`

**Campos opcionais (usado como fallback):**
- ⚠️ `customer_id` → vincula ao customer
- ⚠️ `provider = 'PAGARME'`
- ⚠️ `provider_payment_method_id` → card_id da Pagar.me
- ⚠️ `status = 'ACTIVE'`

**Nota:** Este registro só existe quando o usuário usa "saved card". Na primeira compra, o card_id fica apenas na response do order.

---

## Fluxo Correto (após correção)

### 1. Checkout
- Cria order na Pagar.me → retorna `customer.id` e `card.id`
- Salva subscription com metadata:
  ```json
  {
    "interval": "MONTH",
    "intervalCount": 1,
    "pagarmeCustomerId": "cus_abc123",  // ✅ AGORA PRESENTE
    "pagarmeCardId": "card_xyz789",     // ✅ AGORA PRESENTE
    "pagarmeOrderId": "or_def456",
    "source": "checkout_create_prepaid"
  }
  ```

### 2. Webhook (quando paid)
- Atualiza `payment_transactions`
- Aplica split se configurado
- **Não** ativa subscription (já vem ACTIVE do checkout se paid)

### 3. Scheduler (cron diário 09:00)
- Busca subscriptions com `current_period_end <= now`
- Enfileira `pagarme-prepaid-renewal` para cada uma

### 4. Renewal Job
- ✅ Lê `subscription.metadata.pagarmeCustomerId`
- ✅ Lê `subscription.metadata.pagarmeCardId` (ou busca em `customer_payment_methods`)
- ✅ Valida `customer.document` e `customer.telephone`
- ✅ Cria order na Pagar.me
- ✅ Cobra com card_id salvo
- ✅ Atualiza subscription se paid

---

## Scripts de Correção

### Para subscriptions existentes (backfill)

Criar `local-scripts/backfill_pagarme_customer_card_id.js`:

```javascript
const { prisma } = require("../dist/lib/prisma.js");
const { pagarmeGetOrder } = require("../dist/lib/payments/pagarme/sdk.js");

async function main() {
  const dry = String(process.env.DRY || "").toLowerCase() === "true";
  
  console.log(`🔍 Searching for Pagar.me subscriptions without pagarmeCustomerId/pagarmeCardId...`);
  console.log(`Mode: ${dry ? "DRY RUN" : "LIVE"}\n`);

  // Buscar todas subscriptions PAGARME/KRXPAY ativas ou past_due
  const subs = await prisma.customerSubscription.findMany({
    where: {
      provider: { in: ['PAGARME', 'KRXPAY'] },
      canceledAt: null,
      status: { in: ['ACTIVE', 'PAST_DUE', 'TRIAL', 'PENDING'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${subs.length} active Pagar.me subscriptions\n`);

  let needsFix = 0;
  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const sub of subs) {
    const meta = (sub.metadata && typeof sub.metadata === 'object') ? sub.metadata : {};
    
    // Se já tem ambos, skip
    if (meta.pagarmeCustomerId && meta.pagarmeCardId) {
      skipped++;
      continue;
    }

    needsFix++;
    console.log(`⚠️  Subscription ${sub.id} missing pagarmeCustomerId or pagarmeCardId`);
    console.log(`   Has customerId: ${!!meta.pagarmeCustomerId}, Has cardId: ${!!meta.pagarmeCardId}`);

    // Buscar order_id do metadata
    const pagarmeOrderId = meta.pagarmeOrderId;
    if (!pagarmeOrderId) {
      console.warn(`   ❌ No pagarmeOrderId in metadata, cannot fetch order details\n`);
      errors++;
      continue;
    }

    console.log(`   Order ID: ${pagarmeOrderId}`);

    try {
      // Buscar order na Pagar.me para extrair customer_id e card_id
      const order = await pagarmeGetOrder(String(pagarmeOrderId));
      
      const customerId = order?.customer?.id || null;
      const cardId = (() => {
        const ch = Array.isArray(order?.charges) ? order.charges[0] : null;
        const tx = ch?.last_transaction || null;
        const cid = tx?.card?.id || null;
        if (cid) return cid;
        
        const pay = Array.isArray(order?.payments) ? order.payments[0] : null;
        const payTx = pay?.last_transaction || pay?.transaction || null;
        return payTx?.card?.id || null;
      })();

      console.log(`   Found customerId: ${customerId || 'N/A'}, cardId: ${cardId || 'N/A'}`);

      if (customerId || cardId) {
        if (!dry) {
          if (customerId) meta.pagarmeCustomerId = customerId;
          if (cardId) meta.pagarmeCardId = cardId;
          
          await prisma.customerSubscription.update({
            where: { id: sub.id },
            data: { metadata: meta },
          });
          console.log(`   ✅ Updated subscription metadata\n`);
          fixed++;
        } else {
          console.log(`   [DRY RUN] Would update metadata\n`);
          fixed++;
        }
      } else {
        console.warn(`   ❌ Could not extract customer_id or card_id from order\n`);
        errors++;
      }
    } catch (e) {
      console.error(`   ❌ Failed to fetch order: ${e instanceof Error ? e.message : e}\n`);
      errors++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary:`);
  console.log(`  Total subscriptions: ${subs.length}`);
  console.log(`  Already OK: ${skipped}`);
  console.log(`  Needed fix: ${needsFix}`);
  console.log(`  ${dry ? 'Would fix' : 'Fixed'}: ${fixed}`);
  console.log(`  Errors: ${errors}`);
  console.log(`${'='.repeat(60)}\n`);

  if (dry && needsFix > 0) {
    console.log(`Run without DRY=true to apply changes:\n`);
    console.log(`  node local-scripts/backfill_pagarme_customer_card_id.js\n`);
  }
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
```

### Script de validação

Criar `local-scripts/check_pagarme_renewal_prereqs.js`:

```javascript
const { prisma } = require("../dist/lib/prisma.js");

async function main() {
  const subscriptionId = process.argv[2];
  if (!subscriptionId) {
    console.error("Usage: node local-scripts/check_pagarme_renewal_prereqs.js <subscriptionId>");
    process.exit(1);
  }

  const sub = await prisma.customerSubscription.findUnique({
    where: { id: String(subscriptionId) },
    include: {
      customer: {
        include: {
          paymentMethods: {
            where: { provider: 'PAGARME', status: 'ACTIVE' },
            orderBy: { isDefault: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!sub) {
    console.error("Subscription not found", { subscriptionId });
    process.exit(1);
  }

  const meta = (sub.metadata && typeof sub.metadata === 'object') ? sub.metadata : {};
  const paymentMethod = sub.customer?.paymentMethods?.[0] || null;

  const result = {
    subscription: {
      id: sub.id,
      provider: sub.provider,
      merchantId: sub.merchantId,
      customerId: sub.customerId,
      currentPeriodEnd: sub.currentPeriodEnd,
    },
    pagarme: {
      customer_id_in_metadata: meta.pagarmeCustomerId || null,
      card_id_in_metadata: meta.pagarmeCardId || null,
      order_id_in_metadata: meta.pagarmeOrderId || null,
      payment_method: paymentMethod ? {
        id: paymentMethod.id,
        card_id: paymentMethod.providerPaymentMethodId || null,
        status: paymentMethod.status,
        is_default: paymentMethod.isDefault,
      } : null,
      customer: {
        document: sub.customer?.document || null,
        document_valid: (() => {
          const doc = (sub.customer?.document || '').replace(/\D+/g, '');
          return doc.length === 11 || doc.length === 14;
        })(),
        telephone: sub.customer?.telephone || null,
        telephone_valid: (() => {
          const phone = (sub.customer?.telephone || '').replace(/\D+/g, '');
          return phone.length >= 10;
        })(),
      },
    },
    suspected_causes: [],
  };

  if (!meta.pagarmeCustomerId) result.suspected_causes.push("missing_pagarme_customer_id_in_metadata");
  if (!meta.pagarmeCardId && !paymentMethod?.providerPaymentMethodId) result.suspected_causes.push("missing_pagarme_card_id");
  if (!result.pagarme.customer.document_valid) result.suspected_causes.push("invalid_or_missing_customer_document");
  if (!result.pagarme.customer.telephone_valid) result.suspected_causes.push("invalid_or_missing_customer_telephone");

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
```

---

## Checklist de Validação

Após aplicar a correção, verificar:

- [ ] Checkout salva `pagarmeCustomerId` e `pagarmeCardId` no metadata da subscription
- [ ] Renewal job consegue ler ambos IDs do metadata
- [ ] Renewal job valida `customer.document` e `customer.telephone` antes de cobrar
- [ ] Backfill corrige subscriptions antigas buscando dados do order na Pagar.me

---

## Arquivos Afetados

### Correção Principal
- `src/app/api/checkout/create/route.ts` (linhas 1600-1609)

### Scripts de Suporte
- `local-scripts/check_pagarme_renewal_prereqs.js` (criar)
- `local-scripts/backfill_pagarme_customer_card_id.js` (criar)

### Jobs
- `trigger/renewal-jobs/pagarme-prepaid.ts` (já tem validação)
- `trigger/billing-renewal.ts` (scheduler, OK)

---

## Conclusão

**Problemas raiz:**
1. O checkout não salva `pagarmeCustomerId` no metadata da subscription
2. O checkout não salva `pagarmeCardId` no metadata da subscription

**Solução:** Extrair `customer.id` e `card.id` da response do order e salvar no metadata da subscription.

**Impacto:** Sem essa correção, **nenhuma renovação Pagar.me prepaid funcionará**, pois o job não consegue criar o order sem esses IDs.
