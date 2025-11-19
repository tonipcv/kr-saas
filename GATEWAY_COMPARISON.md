# Comparação Detalhada dos 3 Gateways - Linha por Linha

## 🎯 OBJETIVO
Mostrar exatamente o que cada gateway preenche no banco e onde estão as inconsistências.

---

## 1️⃣ STRIPE CHECKOUT

### **Arquivo**: `/api/checkout/stripe/subscribe/route.ts`

### **Fluxo**:
```typescript
1. Cria/busca Stripe Customer (API Stripe)
2. Cria Stripe Subscription (API Stripe)
3. ❌ NÃO cria PaymentTransaction
4. ⚠️ Pode criar CheckoutSession (outro endpoint)
```

### **Tabelas Preenchidas**:

#### ❌ **PaymentTransaction**: NÃO CRIADA
```typescript
// PROBLEMA: Stripe não grava nada em payment_transactions
// O webhook é que tenta gravar depois, mas pode falhar
```

#### ⚠️ **CheckoutSession**: PARCIAL (se vier de `/api/checkout/session`)
```typescript
{
  id: cuid(),
  resumeToken: crypto.randomUUID(),
  clinicId: "...",           // ✅ Preenchido
  productId: "...",          // ✅ Preenchido
  offerId: null,             // ❌ Nunca preenche
  provider: null,            // ❌ Deveria ser 'STRIPE'
  country: null,             // ❌ Não detecta
  status: 'started',         // ✅ Inicial
  paymentMethod: 'card',     // ✅ Sempre cartão
  paymentTransactionId: null,// ❌ NUNCA CONECTA
  email: buyer.email,        // ✅ Preenchido
  phone: buyer.phone,        // ✅ Preenchido
  // UTMs não preenchidos
}
```

#### ❌ **Customer**: NÃO USA (tabela unificada ignorada)

#### ❌ **CustomerProvider**: NÃO USA

#### ❌ **CustomerPaymentMethod**: NÃO USA

---

## 2️⃣ PAGARME/KRXPAY CHECKOUT

### **Arquivo**: `/api/checkout/subscribe/route.ts`

### **Fluxo**:
```typescript
1. Cria Pagarme Customer (via SDK)
2. Cria Pagarme Card (se novo cartão)
3. Cria Pagarme Subscription (via SDK)
4. ✅ Cria PaymentTransaction (ANTIGO, sem links)
5. ⚠️ CheckoutSession criada em outro lugar
```

### **Tabelas Preenchidas**:

#### ✅ **PaymentTransaction**: CRIADA (mas incompleta)
```typescript
await prisma.paymentTransaction.create({
  data: {
    id: crypto.randomUUID(),
    provider: 'pagarme',          // ❌ String, não enum
    providerOrderId: subscription.id,    // ✅
    providerChargeId: firstCharge?.id,   // ✅
    doctorId: product.doctorId,   // ⚠️ Lógica clínica
    patientProfileId: null,       // ⚠️ Nunca preenche
    clinicId: clinic.id,          // ✅
    merchantId: merchant.id,      // ✅ ÚNICO que preenche!
    productId: product.id,        // ✅
    amountCents: subscription.amount, // ✅
    currency: 'BRL',              // ✅
    installments: 1,              // ✅
    paymentMethodType: 'credit_card', // ✅
    status: 'processing',         // ❌ String livre
    status_v2: null,              // ❌ Enum nunca usado
    rawPayload: subscription,     // ✅
    
    // ❌ CAMPOS CRÍTICOS NÃO PREENCHIDOS:
    customerId: null,             // ❌ NUNCA
    customerProviderId: null,     // ❌ NUNCA
    customerPaymentMethodId: null,// ❌ NUNCA
    customerSubscriptionId: subscription.id, // ⚠️ Às vezes
    provider_v2: null,            // ❌ NUNCA (deveria ser 'PAGARME')
    routedProvider: null,         // ❌ NUNCA
  }
})
```

#### ⚠️ **CheckoutSession**: PARCIAL
```typescript
// Criada em /api/checkout/session/create
{
  id: cuid(),
  resumeToken: token,
  clinicId: clinic.id,          // ✅
  productId: product.id,        // ✅
  offerId: offer?.id,           // ⚠️ Às vezes
  provider: 'KRXPAY',           // ⚠️ Enum correto, mas inconsistente
  country: 'BR',                // ⚠️ Hardcoded
  status: 'started',            // ✅
  paymentMethod: method,        // ✅ 'pix' ou 'card'
  paymentTransactionId: null,   // ❌ NUNCA CONECTA!
  email: data.email,            // ✅
  phone: data.phone,            // ✅
  utmSource: data.utm_source,   // ✅
  // outros UTMs...
}

// DEPOIS, em /api/webhooks/pagarme:
await prisma.checkoutSession.update({
  where: { id: session.id },
  data: {
    status: 'paid',             // ✅ Atualiza
    orderId: webhook.order_id,  // ✅
    // ❌ MAS NUNCA PREENCHE paymentTransactionId!
  }
})
```

#### ❌ **Customer**: NÃO USA (ignora tabela unificada)

#### ❌ **CustomerProvider**: NÃO USA
```typescript
// DEVERIA CRIAR:
await prisma.customerProvider.create({
  data: {
    customerId: customer.id,
    provider: 'PAGARME',
    accountId: merchant.id,
    providerCustomerId: pagarmeCustomer.id,
    metadata: { /* ... */ }
  }
})
```

#### ❌ **CustomerPaymentMethod**: NÃO USA
```typescript
// DEVERIA CRIAR quando salva cartão:
await prisma.customerPaymentMethod.create({
  data: {
    customerId: customer.id,
    customerProviderId: customerProvider.id,
    provider: 'PAGARME',
    accountId: merchant.id,
    providerPaymentMethodId: cardToken,
    brand: cardData.brand,
    last4: cardData.last4,
    expMonth: cardData.exp_month,
    expYear: cardData.exp_year,
    isDefault: true,
    status: 'active',
  }
})
```

---

## 3️⃣ OPEN FINANCE CHECKOUT

### **Arquivo**: `/api/v2/payments/ob/create`, `/api/v2/payments/open-finance/...`

### **Fluxo**:
```typescript
1. Busca/cria EnrollmentContext (vínculo bancário)
2. Cria OpenBankingConsent
3. Cria OpenBankingPayment (tabela própria)
4. ⚠️ Script de migration cria PaymentTransaction depois
```

### **Tabelas Preenchidas**:

#### ✅ **OpenBankingPayment**: TABELA PRÓPRIA
```typescript
await prisma.openBankingPayment.create({
  data: {
    id: uuid(),
    providerPaymentId: obResponse.payment_id,  // ✅
    consentId: consent.consentId,              // ✅
    amountCents: payload.amountCents,          // ✅
    currency: payload.currency,                // ✅
    status: 'PENDING',                         // ✅ Enum próprio
    enrollmentId: enrollment.enrollmentId,     // ✅
    payerId: enrollment.userId,                // ✅
    payerEmail: enrollment.payerEmail,         // ✅
    payerDocument: enrollment.payerDocument,   // ✅
    creditorCpfCnpj: merchant.document,        // ✅
    clinicId: clinic.id,                       // ✅
    productId: payload.productId,              // ✅
    type: 'SINGLE',                            // ✅
    providerResponse: obResponse,              // ✅
    fidoAssertion: fidoData,                   // ✅
    riskSignals: riskData,                     // ✅
  }
})
```

#### ⚠️ **PaymentTransaction**: CRIADA POR SCRIPT (não em tempo real)
```typescript
// Em /scripts/migrations/migrate_open_finance.js
await prisma.paymentTransaction.create({
  data: {
    id: crypto.randomUUID(),
    provider: 'openfinance',      // ❌ String livre
    providerOrderId: obPayment.providerPaymentId,  // ✅
    clinicId: obPayment.clinicId, // ✅
    productId: obPayment.productId, // ✅
    amountCents: obPayment.amountCents, // ✅
    currency: obPayment.currency, // ✅
    status: mapStatus(obPayment.status), // ⚠️ Conversão manual
    rawPayload: obPayment.providerResponse, // ✅
    
    // ❌ CAMPOS CRÍTICOS NÃO PREENCHIDOS:
    customerId: null,             // ❌
    customerProviderId: null,     // ❌
    merchantId: null,             // ❌ Nem tem merchant!
    provider_v2: null,            // ❌ Deveria ser 'OPENFINANCE'
    status_v2: null,              // ❌ Enum PaymentStatus não usado
  }
})
```

#### ✅ **EnrollmentContext**: BEM ESTRUTURADA
```typescript
await prisma.enrollmentContext.create({
  data: {
    id: uuid(),
    userId: user.id,                // ✅
    sessionId: session.id,          // ✅
    enrollmentId: obEnrollment.id,  // ✅
    organisationId: bank.org_id,    // ✅
    authorisationServerId: bank.as_id, // ✅
    status: 'AUTHORISED',           // ✅
    clinicId: clinic.id,            // ✅
    payerEmail: user.email,         // ✅
    payerDocument: user.document,   // ✅
    deviceBinding: deviceInfo,      // ✅
    recurringEnabled: true,         // ✅
  }
})
```

#### ✅ **OpenBankingConsent**: BEM ESTRUTURADA
```typescript
await prisma.openBankingConsent.create({
  data: {
    id: uuid(),
    enrollmentId: enrollment.enrollmentId, // ✅
    consentId: obConsent.consent_id,       // ✅
    amountCents: amount,                   // ✅
    currency: 'BRL',                       // ✅
    creditorName: merchant.name,           // ✅
    creditorCpfCnpj: merchant.cpfCnpj,     // ✅
    clinicId: clinic.id,                   // ✅
    productId: product.id,                 // ✅
    status: 'AWAITING_AUTHORISATION',      // ✅
    providerResponse: obConsent,           // ✅
  }
})
```

#### ❌ **Customer**: NÃO USA (ignora tabela unificada)

---

## 📊 TABELA COMPARATIVA

| Campo | Stripe | Pagarme | Open Finance |
|-------|--------|---------|--------------|
| **PaymentTransaction** | ❌ Não cria | ✅ Cria (incompleto) | ⚠️ Script depois |
| `customerId` | ❌ | ❌ | ❌ |
| `customerProviderId` | ❌ | ❌ | ❌ |
| `customerPaymentMethodId` | ❌ | ❌ | ❌ |
| `merchantId` | ❌ | ✅ | ❌ |
| `provider_v2` (enum) | ❌ | ❌ | ❌ |
| `status_v2` (enum) | ❌ | ❌ | ❌ |
| `routedProvider` | ❌ | ❌ | ❌ |
| **CheckoutSession** | ⚠️ Parcial | ⚠️ Parcial | ⚠️ Parcial |
| `paymentTransactionId` | ❌ | ❌ | ❌ |
| `provider` (enum) | ❌ | ⚠️ Às vezes | ⚠️ Às vezes |
| `offerId` | ❌ | ⚠️ Às vezes | ❌ |
| **Customer** (unificado) | ❌ | ❌ | ❌ |
| **CustomerProvider** | ❌ | ❌ | ❌ |
| **CustomerPaymentMethod** | ❌ | ❌ | N/A |
| **Tabela Própria** | ❌ | ❌ | ✅ OpenBankingPayment |

---

## 🎯 PROBLEMAS COMUNS AOS 3

### 1. **Nenhum usa `Customer` unificado**
```typescript
// TODOS DEVERIAM FAZER:
const customer = await prisma.customer.upsert({
  where: {
    merchantId_email: {
      merchantId: merchant.id,
      email: buyer.email,
    }
  },
  create: {
    merchantId: merchant.id,
    email: buyer.email,
    name: buyer.name,
    phone: buyer.phone,
    document: buyer.document,
    address: buyer.address,
  },
  update: { /* atualizar */ }
})
```

### 2. **Nenhum conecta CheckoutSession↔Transaction**
```typescript
// TODOS DEVERIAM:
const transaction = await prisma.paymentTransaction.create({
  data: { /* ... */ }
})

await prisma.checkoutSession.update({
  where: { id: session.id },
  data: {
    paymentTransactionId: transaction.id,  // ← CONECTAR!
  }
})
```

### 3. **Nenhum usa enums novos**
```typescript
// TODOS DEVERIAM:
provider_v2: 'STRIPE' | 'PAGARME' | 'OPENFINANCE',  // enum
status_v2: 'PENDING' | 'PROCESSING' | 'SUCCEEDED',  // enum
```

### 4. **Nenhum salva payment methods**
```typescript
// Pagarme e Stripe DEVERIAM:
const paymentMethod = await prisma.customerPaymentMethod.create({
  data: {
    customerId: customer.id,
    customerProviderId: customerProvider.id,
    provider: 'PAGARME',
    providerPaymentMethodId: cardToken,
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2025,
    isDefault: true,
  }
})
```

---

## 🔧 CÓDIGO CORRETO (TEMPLATE)

### **Como DEVERIA ser o checkout unificado:**

```typescript
export async function POST(req: Request) {
  const { buyer, payment, productId, offerId, merchantId } = await req.json()
  
  // 1. Criar/buscar Customer unificado
  const customer = await prisma.customer.upsert({
    where: {
      merchantId_email: { merchantId, email: buyer.email }
    },
    create: {
      merchantId,
      email: buyer.email,
      name: buyer.name,
      phone: buyer.phone,
      document: buyer.document,
      address: buyer.address,
    },
    update: { name: buyer.name, phone: buyer.phone }
  })

  // 2. Criar/buscar CustomerProvider
  const customerProvider = await prisma.customerProvider.upsert({
    where: {
      customerId_provider_accountId: {
        customerId: customer.id,
        provider: 'PAGARME',
        accountId: merchantId,
      }
    },
    create: {
      customerId: customer.id,
      provider: 'PAGARME',
      accountId: merchantId,
      providerCustomerId: pagarmeCustomerId,
    },
    update: { providerCustomerId: pagarmeCustomerId }
  })

  // 3. Salvar payment method (se novo cartão)
  let paymentMethodId = payment.saved_card_id
  if (!paymentMethodId && payment.card) {
    const card = await prisma.customerPaymentMethod.create({
      data: {
        customerId: customer.id,
        customerProviderId: customerProvider.id,
        provider: 'PAGARME',
        accountId: merchantId,
        providerPaymentMethodId: cardToken,
        brand: payment.card.brand,
        last4: payment.card.last4,
        expMonth: payment.card.exp_month,
        expYear: payment.card.exp_year,
        isDefault: true,
        status: 'active',
      }
    })
    paymentMethodId = card.id
  }

  // 4. Criar PaymentTransaction ANTES de chamar gateway
  const transaction = await prisma.paymentTransaction.create({
    data: {
      id: crypto.randomUUID(),
      provider: 'pagarme',            // ⚠️ String por compatibilidade
      provider_v2: 'PAGARME',         // ✅ Enum novo
      customerId: customer.id,         // ✅
      customerProviderId: customerProvider.id, // ✅
      customerPaymentMethodId: paymentMethodId, // ✅
      merchantId,                      // ✅
      productId,                       // ✅
      amountCents: amount,             // ✅
      currency: 'BRL',                 // ✅
      status: 'processing',            // ⚠️ String legacy
      status_v2: 'PROCESSING',         // ✅ Enum novo
      clinicId: merchant.clinicId,     // ✅
    }
  })

  // 5. Chamar gateway
  const subscription = await pagarmeCreateSubscription(...)

  // 6. Atualizar transaction com IDs do provedor
  await prisma.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      providerOrderId: subscription.id,
      providerChargeId: subscription.current_charge?.id,
      rawPayload: subscription,
      routedProvider: 'PAGARME',      // ✅
    }
  })

  // 7. Criar/atualizar CheckoutSession
  await prisma.checkoutSession.upsert({
    where: { resumeToken: session.resumeToken },
    create: {
      id: cuid(),
      resumeToken: session.resumeToken,
      clinicId: merchant.clinicId,
      productId,
      offerId,
      provider: 'PAGARME',             // ✅ Enum
      country: buyer.country || 'BR',  // ✅
      status: 'paid',
      paymentMethod: 'card',
      email: buyer.email,
      phone: buyer.phone,
      paymentTransactionId: transaction.id, // ✅ CONECTAR!
    },
    update: {
      status: 'paid',
      paymentTransactionId: transaction.id, // ✅
    }
  })

  // 8. Criar CustomerSubscription (se for assinatura)
  if (isSubscription) {
    await prisma.customerSubscription.create({
      data: {
        customerId: customer.id,
        merchantId,
        productId,
        offerId,
        provider: 'PAGARME',
        accountId: merchantId,
        customerProviderId: customerProvider.id,
        providerSubscriptionId: subscription.id,
        vaultPaymentMethodId: paymentMethodId,
        status: 'ACTIVE',
        priceCents: amount,
        currency: 'BRL',
        currentPeriodStart: new Date(),
        currentPeriodEnd: addMonths(new Date(), 1),
      }
    })
  }

  return { success: true, transactionId: transaction.id }
}
```

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### **Para CADA gateway, você precisa:**

- [ ] Criar/buscar `Customer` unificado
- [ ] Criar/buscar `CustomerProvider`
- [ ] Salvar `CustomerPaymentMethod` (se cartão/método salvo)
- [ ] Criar `PaymentTransaction` ANTES de chamar API
- [ ] Preencher `customerId`, `customerProviderId`, `merchantId`
- [ ] Usar enums `provider_v2` e `status_v2`
- [ ] Atualizar transaction com `providerOrderId`/`providerChargeId`
- [ ] Conectar `CheckoutSession.paymentTransactionId`
- [ ] Criar `CustomerSubscription` se for recorrente
- [ ] Popular `routedProvider` após aplicar regras

---

## 🚨 IMPACTO DE NÃO CORRIGIR

### **Sem Customer unificado:**
- ❌ Cliente pode ter 3+ entradas duplicadas
- ❌ Impossível retry cross-gateway
- ❌ Impossível ver histórico unificado
- ❌ Reconciliação manual

### **Sem CustomerProvider:**
- ❌ Não sabe qual conta usar para retry
- ❌ Não sabe qual token de acesso buscar
- ❌ Migração entre gateways impossível

### **Sem CustomerPaymentMethod:**
- ❌ Retry falha (não tem cartão salvo)
- ❌ Upsell recorrente impossível
- ❌ Checkout 1-click impossível

### **Sem paymentTransactionId em session:**
- ❌ Não rastreia qual transação veio de qual checkout
- ❌ Abandono não conecta com pagamento posterior
- ❌ Funil de conversão quebrado

---

## ✅ PRÓXIMOS PASSOS

1. **Criar migration** para popular `Customer` de dados existentes
2. **Atualizar Pagarme checkout** primeiro (é o mais usado)
3. **Atualizar Stripe checkout**
4. **Atualizar Open Finance** para usar `Customer`
5. **Rodar auditoria** SQL para validar
6. **Deploy gradual** com feature flag
