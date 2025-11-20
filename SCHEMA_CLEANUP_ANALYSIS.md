# Análise de Limpeza do Schema Prisma

## Data: 2025-11-19
## Status Atual do Banco (audit_report.js)
- **331 transações** (30 dias): 208 Pagarme, 54 Appmax, 42 Open Banking, 27 Stripe
- **customer_id**: 52.83% preenchido (últimos 7 dias)
- **provider_v2**: 99.37% preenchido (1 transação sem enum)
- **status_v2**: 99.37% preenchido
- **13 payment_customers** vs **5 customers** (legacy vs novo)

---

## ✅ MODELOS SEGUROS PARA REMOVER

### 1. **PaymentCustomer** (DEPRECAR)
**Status**: ❌ Legacy - substituído por `Customer`
**Uso atual**: 27 matches em 8 arquivos
**Principais usos**:
- `/api/checkout/create/route.ts` (7 matches)
- `/api/checkout/subscribe/route.ts` (6 matches)
- `/api/v2/buyer/upsert/route.ts` (3 matches)

**Ação recomendada**: 
```sql
-- FASE 1: Migrar dados
INSERT INTO customers (id, merchant_id, name, email, phone, document, created_at, updated_at)
SELECT 
  pc.id,
  COALESCE(m.id, 'default-merchant'),
  pc.full_name,
  pc.email,
  pc.phones,
  pc.document,
  pc.created_at,
  pc.updated_at
FROM payment_customers pc
LEFT JOIN clinics c ON c.id = pc.clinic_id
LEFT JOIN merchants m ON m.clinic_id = c.id
WHERE NOT EXISTS (SELECT 1 FROM customers cu WHERE cu.email = pc.email)
ON CONFLICT (id) DO NOTHING;

-- FASE 2: Após 30 dias de dual-write
ALTER TABLE payment_customers RENAME TO _deprecated_payment_customers;
```

**Impacto**: ✅ ZERO - código já migrado para `Customer` no dual-write

---

### 2. **leads** (model legado)
**Status**: ❌ Substituído por `ReferralLead`
**Uso atual**: 54 matches em 11 arquivos
**Ação**: Confirmar se todos os uses cases foram migrados para `ReferralLead` e remover

---

## ⚠️ MODELOS EM REVISÃO (não remover ainda)

### 3. **Purchase**
**Uso**: 98 matches em 19 arquivos
**Status**: ✅ ATIVO - usado intensamente
**Nota**: Modelo core de registro de compras offline/manual (doctor purchase)

### 4. **PointsLedger**
**Uso**: 2 matches (purchases, redemptions)
**Status**: ✅ ATIVO - sistema de pontos/fidelidade
**Nota**: Ledger de pontos (não financeiro), usado para membership

### 5. **PatientProfile**
**Uso**: 30 matches em 14 arquivos
**Status**: ✅ ATIVO - tenancy per doctor
**Nota**: Perfil do paciente scoped por doctor (multi-tenancy)

### 6. **Coupon / CouponTemplate / CouponRedemption**
**Uso**: 70+ matches em 11 arquivos
**Status**: ✅ ATIVO - sistema de cupons
**Nota**: Usado para campanhas e referrals

### 7. **Event** (analytics)
**Uso**: 364 matches em 99 arquivos
**Status**: ✅ ATIVO - event sourcing
**Nota**: Sistema de analytics e auditoria de eventos

### 8. **MessageTemplate / MessageSequence**
**Uso**: Baixo (1-2 matches)
**Status**: ⚠️ EM DESENVOLVIMENTO - messaging automation
**Nota**: Feature nova, não remover

---

## 🔍 MODELOS COM USO LIMITADO (investigar)

### 9. **CampaignJob**
**Uso**: 2 matches em 1 arquivo (`lib/broadcast.ts`)
**Status**: ⚠️ BAIXO USO
**Decisão**: Manter (scheduler de campanhas)

### 10. **OpenFinanceLink / OpenFinanceConsent**
**Uso**: Contexto Open Finance
**Status**: ✅ ATIVO - Pix Automático
**Nota**: Não remover (necessário para recurring OB payments)

---

## 📊 CAMPOS DEPRECADOS NO SCHEMA

### PaymentTransaction
- ✅ **`provider`** (string) → migrar para `provider_v2` (enum)  
- ✅ **`status`** (string) → migrar para `status_v2` (enum)  
- ✅ **`doctorId`** → contexto clínico, considerar remover se não usado  
- ✅ **`patientProfileId`** → contexto clínico, considerar remover

**Ação**: Após 100% migrado para enums, tornar `provider_v2` NOT NULL e deprecar `provider`

---

## 🎯 PLANO DE LIMPEZA

### Fase 1: IMEDIATO (próximos 7 dias)
```typescript
// 1. Remover PaymentCustomer do código
// Substituir todos os usos por Customer

// 2. Adicionar deprecated notice
/** @deprecated Use Customer instead */
model PaymentCustomer {
  // ...
}
```

### Fase 2: 30 DIAS
```sql
-- Renomear tabelas legacy
ALTER TABLE payment_customers RENAME TO _deprecated_payment_customers;
COMMENT ON TABLE _deprecated_payment_customers IS 
'DEPRECATED: Migrated to customers table. Drop after 2025-12-31';
```

### Fase 3: 90 DIAS
```sql
-- Drop tables completamente
DROP TABLE IF EXISTS _deprecated_payment_customers CASCADE;
```

---

## 🚨 NÃO REMOVER (CORE DO SISTEMA)

- ✅ **User, Account, Session, VerificationToken** (NextAuth)
- ✅ **Clinic, ClinicMember, Merchant** (multi-tenancy core)
- ✅ **products, Offer, OfferPrice** (catálogo de produtos)
- ✅ **PaymentTransaction, Customer, CustomerProvider** (payments orchestration)
- ✅ **CustomerPaymentMethod, CustomerSubscription** (vault & subscriptions)
- ✅ **CheckoutSession** (abandoned cart recovery)
- ✅ **WebhookEvent** (idempotency & retry)
- ✅ **EnrollmentContext, OpenBankingPayment, OpenBankingConsent** (Open Finance)
- ✅ **Event** (analytics & audit trail)

---

## 📋 CHECKLIST DE VALIDAÇÃO

Antes de remover qualquer model:
- [ ] Rodar `grep -r "ModelName" src/` e confirmar 0 matches
- [ ] Verificar migrations Prisma (podem ter dependências)
- [ ] Confirmar dados migrados (SQL validation queries)
- [ ] Backup completo do database
- [ ] Testar rollback plan

---

## 🔗 Referências
- `MIGRATION_PLAN.md` - Fase 6 (cleanup)
- `ORCHESTRATION_CHECKLIST.md` - Status implementação
- `docs/payments-ledger.md` - Coverage matrix
