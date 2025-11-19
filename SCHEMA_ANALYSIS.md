# Análise Completa do Schema Prisma - Sistema de Orquestração de Pagamentos

## ❌ PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. **DUPLICAÇÃO MASSIVA DE TABELAS DE CLIENTES/CUSTOMERS**

Você tem **3 tabelas diferentes para armazenar clientes**, causando confusão e inconsistência:

#### **Tabela 1: `PaymentCustomer` (linha 1759)**
```prisma
model PaymentCustomer {
  id         String   @id @default(cuid())
  userId     String?
  clinicId   String?
  email      String?
  document   String?
  fullName   String?
  phones     String?
  createdAt  DateTime
  updatedAt  DateTime
}
```

#### **Tabela 2: `Customer` (linha 945)** - **NOVA ESTRUTURA UNIFICADA**
```prisma
model Customer {
  id         String   @id @default(cuid())
  merchantId String
  name       String?
  email      String?
  phone      String?
  document   String?
  address    Json?
  metadata   Json?
  
  providers      CustomerProvider[]
  paymentMethods CustomerPaymentMethod[]
  subscriptions  CustomerSubscription[]
}
```

#### **Tabela 3: Via `PaymentTransaction.patientProfileId`** (linha 893)
- Referencia `PatientProfile` que referencia `User`
- Lógica clínica, não de pagamentos

**🚨 PROBLEMA**: Cada gateway está gravando em tabelas diferentes!

---

### 2. **PAYMENT_TRANSACTIONS NÃO ESTÁ SENDO POPULADA CORRETAMENTE**

#### **Campos críticos não preenchidos**:
- ❌ `customerId` (linha 916) - **NUNCA preenchido pelos checkouts**
- ❌ `customerProviderId` (linha 917) - **NUNCA preenchido**
- ❌ `customerPaymentMethodId` (linha 918) - **NUNCA preenchido**
- ❌ `customerSubscriptionId` (linha 919) - **SÓ no legado Pagarme**
- ❌ `provider_v2` (linha 927) - **Campo novo nunca usado**
- ❌ `status_v2` (linha 903) - **Enum PaymentStatus nunca usado**
- ✅ `provider` - **String livre (inconsistente)**
- ⚠️ `merchantId` (linha 895) - **Às vezes preenchido**

#### **Campos que são preenchidos**:
- ✅ `providerOrderId`, `providerChargeId` - Pagarme/Stripe
- ✅ `doctorId`, `patientProfileId`, `clinicId` - Lógica antiga
- ✅ `amountCents`, `currency`, `status` (string livre)
- ✅ `rawPayload` - JSON completo do provedor

---

### 3. **CHECKOUT_SESSIONS DESCONECTADA DE PAYMENT_TRANSACTIONS**

#### **Campo `paymentTransactionId` (linha 1153) existe MAS:**
- ❌ **Stripe**: não preenche
- ❌ **Pagarme**: não preenche
- ⚠️ **Open Finance**: preenche parcialmente

```prisma
model CheckoutSession {
  paymentTransactionId   String?   @unique
  paymentTransaction     PaymentTransaction? @relation("SessionPayment", ...)
}
```

**🚨 PROBLEMA**: Não tem como rastrear de qual checkout veio cada transação!

---

### 4. **ENUMS DUPLICADOS E INCONSISTENTES**

#### **Status de Pagamento - 3 versões diferentes:**

**1. PaymentStatus (linha 1811)** - Nunca usado
```prisma
enum PaymentStatus {
  PENDING
  PROCESSING
  REQUIRES_ACTION
  SUCCEEDED
  FAILED
  CANCELED
  EXPIRED
  REFUNDING
  REFUNDED
  PARTIALLY_REFUNDED
  CHARGEBACK
  DISPUTED
}
```

**2. CheckoutSessionStatus (linha 1117)** - Só para sessões
```prisma
enum CheckoutSessionStatus {
  started
  pix_generated
  paid
  abandoned
  canceled
}
```

**3. PaymentStatusOB (linha 1563)** - Só Open Finance
```prisma
enum PaymentStatusOB {
  PENDING
  PROCESSING
  COMPLETED
  REJECTED
  CANCELLED
  EXPIRED
  ACCP
  PAGO
  RJCT
  CANC
}
```

**🚨 PROBLEMA**: `PaymentTransaction.status` é **String livre**, cada gateway escreve diferente!

---

### 5. **PROVIDER ENUM INCOMPLETO**

```prisma
enum PaymentProvider {
  KRXPAY      // ✅ Tem
  STRIPE      // ✅ Tem
  ADYEN       // ❓ Não implementado
  APPMAX      // ❓ Não implementado
  PAYPAL      // ❓ Não implementado
  MERCADOPAGO // ❓ Não implementado
  PAGARME     // ✅ Tem (mas é chamado KRXPAY no código)
  OPENFINANCE // ✅ Tem
}
```

**🚨 PROBLEMA**: Código usa `provider: 'pagarme'` (string), schema tem enum `PAGARME`

---

## 🔥 COMPARAÇÃO DOS 3 GATEWAYS

### **STRIPE** (`/api/checkout/stripe/subscribe/route.ts`)
#### O que preenche:
- ✅ `CheckoutSession` (parcial)
- ❌ `PaymentTransaction` (não cria!)
- ❌ `Customer` (nova estrutura ignorada)
- ⚠️ Usa Stripe Customer direto

#### O que está errado:
1. Não grava `PaymentTransaction`
2. Não conecta `CheckoutSession.paymentTransactionId`
3. Não usa `Customer` unificado
4. Não preenche `merchantId`

---

### **PAGARME/KRXPAY** (`/api/checkout/subscribe/route.ts`)
#### O que preenche:
- ✅ `PaymentTransaction` (antigo, sem links)
- ⚠️ `CheckoutSession` (parcial)
- ❌ `Customer` (nova estrutura ignorada)
- ❌ `CustomerProvider` (nunca usado)

#### O que está errado:
1. Ignora `Customer` unificado
2. Não preenche `customerId`, `customerProviderId`
3. Usa `doctorId`/`patientProfileId` (lógica clínica)
4. Status é string livre: `"processing"`, `"paid"`, etc.
5. Não usa `provider_v2` (enum)

---

### **OPEN FINANCE** (`/api/v2/payments/...`)
#### O que preenche:
- ✅ `OpenBankingPayment` (tabela própria)
- ⚠️ `PaymentTransaction` (via migration script)
- ✅ `EnrollmentContext` (vinculação bancária)
- ✅ `OpenBankingConsent` (consents JSR)

#### O que está errado:
1. Usa tabela separada `OpenBankingPayment`
2. Migration para `PaymentTransaction` é manual/assíncrona
3. Não usa `Customer` unificado
4. Status é enum próprio `PaymentStatusOB`

---

## 📊 TABELAS IMPORTANTES NÃO PREENCHIDAS

### ❌ **Nunca ou raramente usadas:**
1. **`Customer`** - Nova estrutura ignorada por todos
2. **`CustomerProvider`** - Link provedor nunca criado
3. **`CustomerPaymentMethod`** - Cartões salvos não vão aqui
4. **`CustomerSubscription`** - Assinaturas não usam
5. **`PaymentRoutingRule`** - Regras de roteamento não aplicadas
6. **`ProductIntegration`** - Links produto↔provedor vazios
7. **`MerchantIntegration`** - Credenciais não migradas

### ⚠️ **Parcialmente usadas:**
- **`CheckoutSession`** - Falta `paymentTransactionId`
- **`PaymentTransaction`** - Falta `customerId`, `provider_v2`, `status_v2`
- **`Offer`** - Criada mas não usada nos checkouts antigos
- **`OfferPrice`** - Preços por país não consultados consistentemente

---

## ✅ O QUE ESTÁ FUNCIONANDO (PARCIALMENTE)

1. **PaymentTransaction** - Grava dados básicos (sem links)
2. **CheckoutSession** - Rastreamento de abandonos funciona
3. **Merchant/MerchantApplication** - Onboarding funciona
4. **OpenFinance*** - Tabelas próprias bem estruturadas
5. **Offer/OfferPrice** - Modelo novo está OK, falta usar

---

## 🎯 RECOMENDAÇÕES URGENTES

### **1. Unificar Customer**
- Migrar todos os gateways para usar `Customer` único
- Deprecar `PaymentCustomer`
- Popular `CustomerProvider` ao criar customer em cada gateway

### **2. Conectar PaymentTransaction**
```prisma
// Campos obrigatórios:
customerId              String   ← Customer.id
customerProviderId      String?  ← CustomerProvider.id
provider_v2             PaymentProvider ← usar enum
status_v2               PaymentStatus   ← usar enum
merchantId              String   ← sempre preencher
```

### **3. Conectar CheckoutSession↔Transaction**
- Sempre preencher `CheckoutSession.paymentTransactionId`
- Criar transação ANTES de chamar gateway
- Atualizar com `providerOrderId` depois

### **4. Padronizar Status**
- Migrar todos para usar `PaymentStatus` enum
- Criar função de mapeamento: `providerStatus → PaymentStatus`
- Deprecar `status: String`

### **5. Preencher CustomerPaymentMethod**
- Salvar cartões tokenizados em `CustomerPaymentMethod`
- Vincular a `CustomerProvider` correto
- Usar no retry de pagamentos

### **6. Aplicar PaymentRoutingRule**
- Ler regras antes de criar transação
- Popular `PaymentTransaction.routedProvider`
- Usar para split/routing inteligente

---

## 📋 CHECKLIST DE MIGRAÇÃO

### **Fase 1: Dados Críticos** (1-2 semanas)
- [ ] Criar migration para popular `Customer` de `PaymentCustomer`
- [ ] Adicionar `customerId` em todos os checkouts
- [ ] Preencher `provider_v2` e `status_v2`
- [ ] Conectar `CheckoutSession.paymentTransactionId`

### **Fase 2: Integrações** (2-3 semanas)
- [ ] Migrar Stripe para `Customer` unificado
- [ ] Migrar Pagarme para `Customer` unificado
- [ ] Implementar `CustomerProvider` em todos
- [ ] Salvar cartões em `CustomerPaymentMethod`

### **Fase 3: Features** (3-4 semanas)
- [ ] Implementar roteamento via `PaymentRoutingRule`
- [ ] Usar `OfferPrice` para preços por país
- [ ] Popular `ProductIntegration`
- [ ] Migrar `MerchantIntegration`

---

## 🔍 COMANDOS DE AUDITORIA

```sql
-- 1. Verificar transações sem customer
SELECT COUNT(*) FROM payment_transactions WHERE customer_id IS NULL;

-- 2. Verificar sessões sem transação
SELECT COUNT(*) FROM checkout_sessions WHERE payment_transaction_id IS NULL AND status = 'paid';

-- 3. Verificar uso de status enum vs string
SELECT status, COUNT(*) FROM payment_transactions GROUP BY status;

-- 4. Verificar providers inconsistentes
SELECT provider, COUNT(*) FROM payment_transactions GROUP BY provider;

-- 5. Clientes duplicados
SELECT email, COUNT(*) FROM payment_customers GROUP BY email HAVING COUNT(*) > 1;
```

---

## 🚨 RISCOS ATUAIS

1. **Impossível rastrear cliente através de gateways** - cada um usa estrutura diferente
2. **Retry de pagamentos falha** - sem `CustomerPaymentMethod` preenchido
3. **Roteamento manual** - `PaymentRoutingRule` não aplicada
4. **Relatórios quebrados** - status inconsistentes
5. **Reconciliação difícil** - session↔transaction desconectadas

---

## 📈 MÉTRICAS DE SUCESSO

Após correção, você deve ter:
- ✅ 100% transações com `customerId` preenchido
- ✅ 100% transações com `provider_v2` (enum)
- ✅ 100% transações com `status_v2` (enum)
- ✅ 100% sessions pagas com `paymentTransactionId`
- ✅ 0 clientes duplicados entre `Customer` e `PaymentCustomer`
- ✅ Routing rules aplicadas em 100% transações
