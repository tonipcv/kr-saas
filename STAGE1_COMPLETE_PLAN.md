# 🎯 STAGE 1 - PLANO COMPLETO DE UNIFICAÇÃO

## 📋 RESUMO EXECUTIVO

**Objetivo**: Remover TODAS as escritas em tabelas legacy (`payment_customers`, `payment_methods`) e garantir que TUDO use apenas o modelo unificado.

**Status Atual**:
- ✅ Stripe: JÁ unificado (webhook + record + subscribe)
- ✅ AppMax: JÁ unificado (webhook)
- ✅ V2 Buyer: JÁ unificado
- ✅ Saved Cards: JÁ unificado
- ❌ Checkout Create (Pagarme): USA AMBOS (legacy + unificado)
- ❌ Checkout Subscribe (Pagarme): USA APENAS LEGACY
- ❌ Webhook Pagarme: USA AMBOS (legacy + unificado)

---

## 🔧 MUDANÇAS NECESSÁRIAS

### 1️⃣ **checkout/create/route.ts** - REMOVER LEGACY

**Linhas a REMOVER**: 1143-1198

**O que remover**:
```typescript
// BLOCO INTEIRO DE payment_customers (linhas 1143-1161)
if (HAS_PC && doctorId && profileId && pgCustomerId) {
  const pcId = crypto.randomUUID();
  const sql = PC_HAS_UNIQUE ? ... : ...;
  await prisma.$executeRawUnsafe(sql, ...);
}

// BLOCO INTEIRO DE payment_methods (linhas 1162-1198)
if (HAS_PM && HAS_PC && doctorId && profileId && pgCardId) {
  const rows = await prisma.$queryRawUnsafe<any[]>(...);
  const paymentCustomerId = rows?.[0]?.id || null;
  if (paymentCustomerId) {
    const pmId = crypto.randomUUID();
    const sql = PM_HAS_UNIQUE ? ... : ...;
    await prisma.$executeRawUnsafe(sql, ...);
  }
}
```

**O que MANTER**:
- Linha 1199-1268: MIRROR unificado (customer_providers, customer_payment_methods) ✅
- Linha 1274-1337: INSERT payment_transactions COM customer_id ✅

**Também REMOVER flags de existência** (linhas 300-323):
```typescript
// REMOVER verificação de tabelas legacy
const exists = await prisma.$queryRaw<any[]>`
  SELECT 
    to_regclass('public.payment_customers') IS NOT NULL as has_pc,
    to_regclass('public.payment_methods') IS NOT NULL as has_pm,
    ...
`;
HAS_PC = !!exists?.[0]?.has_pc;
HAS_PM = !!exists?.[0]?.has_pm;
```

---

### 2️⃣ **checkout/subscribe/route.ts** - SUBSTITUIR LEGACY POR UNIFICADO

**Linhas a REMOVER**: 786-846

**O que remover**:
```typescript
// BLOCO INTEIRO (linhas 786-846)
// Upsert payment_customers if table exists...
try {
  if (providerCustomerId) {
    const custTableRows: any[] = await prisma.$queryRawUnsafe(...);
    const custTableExists = ...;
    if (custTableExists) {
      const pcId = crypto.randomUUID();
      const inserted: any[] = await prisma.$queryRawUnsafe(
        `INSERT INTO payment_customers ...`
      );
      ...
      // Insert payment_methods if table exists...
      if (cardId) {
        const methodsTableRows: any[] = await prisma.$queryRawUnsafe(...);
        const methodsTableExists = ...;
        if (methodsTableExists) {
          const pmId = crypto.randomUUID();
          await prisma.$executeRawUnsafe(
            `INSERT INTO payment_methods ...`
          );
        }
      }
    }
  }
} catch (e) {
  console.warn('[subscribe] persist payment_customers/methods failed:', ...);
}
```

**O que ADICIONAR no lugar** (após linha 784):
```typescript
// MIRROR to Business Client data model (NOVO)
try {
  const buyerEmailStr = String(buyer?.email || '');
  let unifiedCustomerId: string | null = null;
  let merchantId: string | null = null;
  
  if (buyerEmailStr && clinic?.id) {
    const merchantRow = await prisma.merchant.findFirst({ 
      where: { clinicId: String(clinic.id) }, 
      select: { id: true } 
    });
    if (merchantRow?.id) {
      merchantId = merchantRow.id;
      const existing = await prisma.customer.findFirst({ 
        where: { merchantId: String(merchantId), email: buyerEmailStr }, 
        select: { id: true } 
      });
      if (existing?.id) unifiedCustomerId = existing.id;
      else {
        const created = await prisma.customer.create({ 
          data: { 
            merchantId: String(merchantId), 
            email: buyerEmailStr, 
            name: String(buyer?.name || '') 
          } as any, 
          select: { id: true } 
        } as any);
        unifiedCustomerId = created.id;
      }
    }
  }
  
  if (unifiedCustomerId && merchantId) {
    // Upsert customer_providers
    if (providerCustomerId) {
      const rowsCP = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM customer_providers WHERE customer_id = $1 AND provider = 'PAGARME' AND account_id = $2 LIMIT 1`,
        String(unifiedCustomerId), String(merchantId)
      ).catch(() => []);
      
      if (rowsCP && rowsCP.length > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE customer_providers SET provider_customer_id = $2, updated_at = NOW() WHERE id = $1`,
          String(rowsCP[0].id), String(providerCustomerId)
        );
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO customer_providers (id, customer_id, provider, account_id, provider_customer_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 'PAGARME'::"PaymentProvider", $2, $3, NOW(), NOW())`,
          String(unifiedCustomerId), String(merchantId), String(providerCustomerId)
        );
      }
    }
    
    // Upsert customer_payment_methods
    if (cardId) {
      const brand = null; // Pagarme subscribe doesn't provide brand upfront
      const last4 = (payment?.card?.number ? String(payment.card.number).replace(/\s+/g, '') : '').slice(-4) || null;
      const expMonth = Number(payment?.card?.exp_month || 0);
      const expYear = Number((() => { const y = Number(payment?.card?.exp_year || 0); return y < 100 ? 2000 + y : y; })());
      
      const rowsPM = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM customer_payment_methods 
         WHERE customer_id = $1 AND provider = 'PAGARME' AND account_id = $2 AND last4 = $3 
         ORDER BY created_at DESC LIMIT 1`,
        String(unifiedCustomerId), String(merchantId), String(last4 || '')
      ).catch(() => []);
      
      if (rowsPM && rowsPM.length > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE customer_payment_methods SET brand = $2, exp_month = $3, exp_year = $4, status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
          String(rowsPM[0].id), brand, expMonth, expYear
        );
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO customer_payment_methods (id, customer_id, provider, account_id, brand, last4, exp_month, exp_year, status, is_default, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 'PAGARME'::"PaymentProvider", $2, $3, $4, $5, $6, 'ACTIVE', true, NOW(), NOW())`,
          String(unifiedCustomerId), String(merchantId), brand, last4, expMonth, expYear
        );
      }
    }
    
    try { console.log('[subscribe] ✅ Mirrored to Business Client tables', { customerId: unifiedCustomerId, hasProvider: !!providerCustomerId, hasMethod: !!cardId }); } catch {}
  }
} catch (e) {
  console.warn('[subscribe] mirror to business tables failed (non-fatal):', e instanceof Error ? e.message : e);
}
```

**TAMBÉM ADICIONAR customer_id no INSERT de payment_transactions** (linha 894):
```typescript
// ANTES (linha 894):
`INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, amount_cents, ...)`

// DEPOIS:
`INSERT INTO payment_transactions (id, provider, provider_order_id, doctor_id, patient_profile_id, clinic_id, product_id, customer_id, amount_cents, ...)`

// E adicionar o parâmetro (após linha 902):
String(productId),
unifiedCustomerId, // NOVO
Number(amountCents),
```

---

### 3️⃣ **payments/pagarme/webhook/route.ts** - REMOVER LEGACY

**Linhas a REMOVER**: 863-901

**O que remover**:
```typescript
// BLOCO INTEIRO (linhas 863-901)
if (pgCustomerId && backfillDoctorId && backfillProfileId) {
  const pcId = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO payment_customers ...`
  );
}
if (pgCardId && backfillDoctorId && backfillProfileId) {
  const rows = await prisma.$queryRawUnsafe<any[]>(...);
  const paymentCustomerId = rows?.[0]?.id || null;
  if (paymentCustomerId) {
    const pmId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO payment_methods ...`
    );
  }
}
```

**O que MANTER**:
- Linha 903-980: MIRROR unificado (já existe e está correto) ✅

---

## ✅ CHECKLIST DE EXECUÇÃO

### Arquivo 1: `checkout/create/route.ts`
- [ ] Remover linhas 300-323 (flags HAS_PC, HAS_PM)
- [ ] Remover linhas 1143-1198 (blocos payment_customers + payment_methods)
- [ ] Manter linhas 1199-1268 (MIRROR unificado)
- [ ] Manter linhas 1274-1337 (INSERT com customer_id)

### Arquivo 2: `checkout/subscribe/route.ts`
- [ ] Remover linhas 786-846 (bloco legacy completo)
- [ ] Adicionar MIRROR unificado (mesmo padrão do create)
- [ ] Adicionar `customer_id` no INSERT de payment_transactions (linha 894)
- [ ] Adicionar variável `unifiedCustomerId` no escopo correto

### Arquivo 3: `payments/pagarme/webhook/route.ts`
- [ ] Remover linhas 863-901 (blocos payment_customers + payment_methods)
- [ ] Manter linhas 903-980 (MIRROR unificado já existe)

---

## 🧪 TESTES OBRIGATÓRIOS

Após aplicar TODAS as mudanças:

### Teste 1: Compra One-Time (Pagarme)
```bash
# Fazer checkout de produto normal
# Verificar em /business/clients/[customer_id]:
✅ Providers: PAGARME com account_id
✅ Payment Methods: cartão com brand/last4/exp
✅ Charges: transação com order_id/amount/status
```

### Teste 2: Assinatura (Pagarme)
```bash
# Fazer checkout de assinatura anual
# Verificar em /business/clients/[customer_id]:
✅ Providers: PAGARME com account_id
✅ Payment Methods: cartão com last4/exp
✅ Charges: transação inicial
✅ Subscriptions: assinatura PENDING

# Após webhook order.paid:
✅ Subscriptions: assinatura ACTIVE
```

### Teste 3: Stripe (já deve funcionar)
```bash
# Fazer checkout Stripe
# Verificar em /business/clients/[customer_id]:
✅ Providers: STRIPE com account_id
✅ Charges: transação Stripe
```

---

## 📊 RESULTADO ESPERADO

### ANTES (problema):
- Dados gravados em 2 lugares (legacy + unificado)
- Subscribe não aparecia no Business Client
- Inconsistências e bugs

### DEPOIS (solução):
- Dados gravados APENAS no modelo unificado
- Subscribe aparece corretamente
- Tudo consistente e funcionando

---

## 🚀 PRÓXIMOS PASSOS (STAGE 2)

Após confirmar que tudo funciona:
1. Backfill de dados antigos (opcional)
2. Criar views guard para detectar writes esquecidos
3. Remover tabelas legacy do schema
4. Deploy final

---

**Data**: 21/11/2025 18:45
**Status**: PRONTO PARA EXECUÇÃO
**Estimativa**: 30min de implementação + 15min de testes
