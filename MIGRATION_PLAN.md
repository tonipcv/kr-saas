# Plano de Migração - Correção do Schema

## 🎯 OBJETIVO
Corrigir as inconsistências do schema e popular campos faltantes sem quebrar o sistema em produção.

---

## 📋 FASE 1: PREPARAÇÃO (SEM DOWNTIME)

### **1.1 Adicionar colunas novas (NÃO NULAS depois)**

```sql
-- Adicionar colunas opcionais primeiro
ALTER TABLE payment_transactions 
ADD COLUMN IF NOT EXISTS customer_id VARCHAR,
ADD COLUMN IF NOT EXISTS customer_provider_id VARCHAR,
ADD COLUMN IF NOT EXISTS customer_payment_method_id VARCHAR,
ADD COLUMN IF NOT EXISTS customer_subscription_id VARCHAR;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_id 
ON payment_transactions(customer_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_provider_id 
ON payment_transactions(customer_provider_id);
```

### **1.2 Migrar PaymentCustomer → Customer**

```sql
-- Criar Customer de PaymentCustomer existentes
INSERT INTO customers (id, merchant_id, name, email, phone, document, address, created_at, updated_at)
SELECT 
  pc.id,
  COALESCE(m.id, 'default-merchant') as merchant_id,
  pc.full_name as name,
  pc.email,
  pc.phones as phone,
  pc.document,
  '{}' as address,
  pc.created_at,
  pc.updated_at
FROM payment_customers pc
LEFT JOIN clinics c ON c.id = pc.clinic_id
LEFT JOIN merchants m ON m.clinic_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM customers cu WHERE cu.email = pc.email
)
ON CONFLICT (id) DO NOTHING;
```

### **1.3 Popular customer_id em payment_transactions (Pagarme)**

```sql
-- Link transações existentes do Pagarme
UPDATE payment_transactions pt
SET customer_id = c.id
FROM payment_customers pc
JOIN clinics cl ON cl.id = pc.clinic_id
JOIN customers c ON c.email = pc.email AND c.merchant_id = (
  SELECT m.id FROM merchants m WHERE m.clinic_id = cl.id LIMIT 1
)
WHERE pt.clinic_id = pc.clinic_id
  AND pt.provider = 'pagarme'
  AND pt.customer_id IS NULL
  AND pc.email IS NOT NULL;
```

### **1.4 Popular customer_id em payment_transactions (Open Finance)**

```sql
-- Link transações Open Finance via OpenBankingPayment
UPDATE payment_transactions pt
SET customer_id = c.id
FROM openbanking_payments obp
JOIN enrollment_contexts ec ON ec.enrollment_id = obp.enrollment_id
JOIN customers c ON c.email = ec.payer_email
WHERE pt.provider_order_id = obp.provider_payment_id
  AND pt.provider IN ('openfinance', 'open_finance')
  AND pt.customer_id IS NULL
  AND c.email IS NOT NULL;
```

### **1.5 Criar CustomerProvider para Pagarme**

```sql
-- Criar CustomerProvider de transações Pagarme
INSERT INTO customer_providers (
  id, customer_id, provider, account_id, 
  provider_customer_id, created_at, updated_at
)
SELECT DISTINCT ON (c.id, m.id)
  gen_random_uuid(),
  c.id,
  'PAGARME',
  m.id,
  -- Extrair do rawPayload se existir
  COALESCE(
    (pt.raw_payload->>'customer_id')::text,
    (pt.raw_payload->'customer'->>'id')::text,
    'legacy-' || c.id
  ),
  NOW(),
  NOW()
FROM payment_transactions pt
JOIN customers c ON c.id = pt.customer_id
JOIN merchants m ON m.id = pt.merchant_id
WHERE pt.provider = 'pagarme'
  AND pt.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM customer_providers cp 
    WHERE cp.customer_id = c.id 
      AND cp.provider = 'PAGARME'
      AND cp.account_id = m.id
  )
ON CONFLICT DO NOTHING;
```

### **1.6 Popular customer_provider_id em payment_transactions**

```sql
-- Link CustomerProvider em transações
UPDATE payment_transactions pt
SET customer_provider_id = cp.id
FROM customer_providers cp
WHERE pt.customer_id = cp.customer_id
  AND pt.merchant_id = cp.account_id
  AND pt.provider = LOWER(cp.provider::text)
  AND pt.customer_provider_id IS NULL;
```

### **1.7 Popular paymentTransactionId em checkout_sessions**

```sql
-- Conectar sessões pagas com transações (por orderId)
UPDATE checkout_sessions cs
SET payment_transaction_id = pt.id
FROM payment_transactions pt
WHERE cs.order_id = pt.provider_order_id
  AND cs.status IN ('paid', 'pix_generated')
  AND cs.payment_transaction_id IS NULL
  AND pt.provider_order_id IS NOT NULL;

-- Conectar por pixOrderId também
UPDATE checkout_sessions cs
SET payment_transaction_id = pt.id
FROM payment_transactions pt
WHERE cs.pix_order_id = pt.provider_order_id
  AND cs.status IN ('paid', 'pix_generated')
  AND cs.payment_transaction_id IS NULL
  AND pt.provider_order_id IS NOT NULL;
```

---

## 📋 FASE 2: MIGRAÇÃO DE ENUMS (PROGRESSIVA)

### **2.1 Popular provider_v2**

```sql
-- Migrar provider string → enum
UPDATE payment_transactions
SET provider_v2 = CASE
  WHEN LOWER(provider) IN ('pagarme', 'pagar.me') THEN 'PAGARME'
  WHEN LOWER(provider) = 'stripe' THEN 'STRIPE'
  WHEN LOWER(provider) IN ('openfinance', 'open_finance', 'ob') THEN 'OPENFINANCE'
  WHEN LOWER(provider) = 'krxpay' THEN 'KRXPAY'
  WHEN LOWER(provider) = 'appmax' THEN 'APPMAX'
  ELSE NULL
END
WHERE provider_v2 IS NULL;
```

### **2.2 Popular status_v2**

```sql
-- Migrar status string → enum PaymentStatus
UPDATE payment_transactions
SET status_v2 = CASE
  -- Pagarme status mapping
  WHEN LOWER(status) IN ('processing', 'pending', 'waiting_payment') THEN 'PROCESSING'
  WHEN LOWER(status) IN ('paid', 'pago', 'succeeded', 'authorized') THEN 'SUCCEEDED'
  WHEN LOWER(status) IN ('failed', 'refused', 'rejected') THEN 'FAILED'
  WHEN LOWER(status) IN ('canceled', 'cancelled', 'voided') THEN 'CANCELED'
  WHEN LOWER(status) IN ('expired', 'timeout') THEN 'EXPIRED'
  WHEN LOWER(status) IN ('refunding', 'pending_refund') THEN 'REFUNDING'
  WHEN LOWER(status) IN ('refunded', 'refund') THEN 'REFUNDED'
  WHEN LOWER(status) = 'partially_refunded' THEN 'PARTIALLY_REFUNDED'
  WHEN LOWER(status) IN ('chargeback', 'disputed') THEN 'CHARGEBACK'
  WHEN LOWER(status) = 'requires_action' THEN 'REQUIRES_ACTION'
  ELSE 'PENDING'
END
WHERE status_v2 IS NULL;
```

### **2.3 Popular routedProvider**

```sql
-- Copiar provider para routedProvider (já aplicado)
UPDATE payment_transactions
SET routed_provider = provider
WHERE routed_provider IS NULL
  AND provider IS NOT NULL;
```

---

## 📋 FASE 3: POPULAR PAYMENT METHODS

### **3.1 Extrair cartões salvos do rawPayload (Pagarme)**

```sql
-- Criar CustomerPaymentMethod de dados Pagarme
INSERT INTO customer_payment_methods (
  id, customer_id, customer_provider_id, provider, 
  account_id, provider_payment_method_id, brand, last4, 
  exp_month, exp_year, is_default, status, created_at, updated_at
)
SELECT DISTINCT ON (c.id, card_id)
  gen_random_uuid(),
  c.id as customer_id,
  cp.id as customer_provider_id,
  'PAGARME',
  m.id as account_id,
  COALESCE(
    (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'id')::text,
    (pt.raw_payload->'card'->>'id')::text
  ) as provider_payment_method_id,
  COALESCE(
    (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'brand')::text,
    (pt.raw_payload->'card'->>'brand')::text,
    'unknown'
  ) as brand,
  COALESCE(
    (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'last_four_digits')::text,
    (pt.raw_payload->'card'->>'last_four_digits')::text
  ) as last4,
  COALESCE(
    (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'exp_month')::int,
    (pt.raw_payload->'card'->>'exp_month')::int
  ) as exp_month,
  COALESCE(
    (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'exp_year')::int,
    (pt.raw_payload->'card'->>'exp_year')::int
  ) as exp_year,
  true as is_default,
  'active' as status,
  pt.created_at,
  NOW()
FROM payment_transactions pt
JOIN customers c ON c.id = pt.customer_id
JOIN customer_providers cp ON cp.customer_id = c.id AND cp.provider = 'PAGARME'
JOIN merchants m ON m.id = pt.merchant_id
WHERE pt.provider = 'pagarme'
  AND pt.payment_method_type = 'credit_card'
  AND pt.raw_payload IS NOT NULL
  AND (
    pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'id' IS NOT NULL
    OR pt.raw_payload->'card'->>'id' IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM customer_payment_methods cpm
    WHERE cpm.customer_id = c.id
      AND cpm.provider = 'PAGARME'
      AND cpm.provider_payment_method_id = COALESCE(
        (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'id')::text,
        (pt.raw_payload->'card'->>'id')::text
      )
  )
ON CONFLICT DO NOTHING;
```

### **3.2 Popular customer_payment_method_id**

```sql
-- Link payment methods em transações
UPDATE payment_transactions pt
SET customer_payment_method_id = cpm.id
FROM customer_payment_methods cpm
WHERE pt.customer_provider_id = cpm.customer_provider_id
  AND pt.payment_method_type = 'credit_card'
  AND pt.customer_payment_method_id IS NULL
  AND cpm.provider_payment_method_id = COALESCE(
    (pt.raw_payload->'current_charge'->'last_transaction'->'card'->>'id')::text,
    (pt.raw_payload->'card'->>'id')::text
  );
```

---

## 📋 FASE 4: CRIAR SUBSCRIPTIONS UNIFICADAS

### **4.1 Migrar assinaturas Pagarme**

```sql
-- Criar CustomerSubscription de assinaturas Pagarme
INSERT INTO customer_subscriptions (
  id, customer_id, merchant_id, product_id, offer_id,
  provider, account_id, customer_provider_id,
  provider_subscription_id, vault_payment_method_id,
  status, price_cents, currency, 
  start_at, current_period_start, current_period_end,
  created_at, updated_at
)
SELECT DISTINCT ON (subscription_id)
  gen_random_uuid(),
  pt.customer_id,
  pt.merchant_id,
  pt.product_id,
  cs.offer_id,
  'PAGARME',
  pt.merchant_id,
  pt.customer_provider_id,
  (pt.raw_payload->>'id')::text as provider_subscription_id,
  pt.customer_payment_method_id,
  CASE 
    WHEN (pt.raw_payload->>'status') = 'active' THEN 'ACTIVE'
    WHEN (pt.raw_payload->>'status') = 'trialing' THEN 'TRIAL'
    WHEN (pt.raw_payload->>'status') = 'canceled' THEN 'CANCELED'
    ELSE 'ACTIVE'
  END as status,
  pt.amount_cents,
  pt.currency,
  (pt.raw_payload->>'created_at')::timestamp as start_at,
  (pt.raw_payload->>'current_period_start')::timestamp,
  (pt.raw_payload->>'current_period_end')::timestamp,
  pt.created_at,
  NOW()
FROM payment_transactions pt
LEFT JOIN checkout_sessions cs ON cs.payment_transaction_id = pt.id
WHERE pt.provider = 'pagarme'
  AND pt.raw_payload->>'id' IS NOT NULL
  AND pt.raw_payload->>'billing_type' = 'prepaid'
  AND pt.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM customer_subscriptions csub
    WHERE csub.provider_subscription_id = (pt.raw_payload->>'id')::text
  )
ON CONFLICT DO NOTHING;
```

---

## 📋 FASE 5: AUDITORIA E VALIDAÇÃO

### **5.1 Queries de validação**

```sql
-- 1. Verificar transações sem customer
SELECT COUNT(*), provider, status
FROM payment_transactions
WHERE customer_id IS NULL
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY provider, status
ORDER BY count DESC;

-- 2. Verificar sessões sem transação (pagas)
SELECT COUNT(*), provider, status
FROM checkout_sessions
WHERE payment_transaction_id IS NULL
  AND status = 'paid'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY provider, status;

-- 3. Verificar uso de enums
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN provider_v2 IS NOT NULL THEN 1 END) as with_enum_provider,
  COUNT(CASE WHEN status_v2 IS NOT NULL THEN 1 END) as with_enum_status
FROM payment_transactions
WHERE created_at > NOW() - INTERVAL '30 days';

-- 4. Verificar customers duplicados
SELECT email, COUNT(*)
FROM customers
GROUP BY email
HAVING COUNT(*) > 1;

-- 5. Verificar taxa de preenchimento
SELECT
  'customer_id' as field,
  COUNT(CASE WHEN customer_id IS NOT NULL THEN 1 END)::float / COUNT(*) * 100 as fill_percentage
FROM payment_transactions
WHERE created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'customer_provider_id' as field,
  COUNT(CASE WHEN customer_provider_id IS NOT NULL THEN 1 END)::float / COUNT(*) * 100
FROM payment_transactions
WHERE created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'provider_v2' as field,
  COUNT(CASE WHEN provider_v2 IS NOT NULL THEN 1 END)::float / COUNT(*) * 100
FROM payment_transactions
WHERE created_at > NOW() - INTERVAL '7 days';
```

---

## 📋 FASE 6: LIMPEZA (APÓS 30 DIAS)

### **6.1 Tornar colunas NOT NULL (quando 100% populadas)**

```sql
-- Verificar se pode tornar NOT NULL
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM payment_transactions WHERE customer_id IS NULL AND created_at > NOW() - INTERVAL '7 days') = 0 THEN
    ALTER TABLE payment_transactions
    ALTER COLUMN customer_id SET NOT NULL;
    
    RAISE NOTICE 'customer_id SET NOT NULL';
  ELSE
    RAISE NOTICE 'customer_id still has NULLs, skipping';
  END IF;
END $$;
```

### **6.2 Adicionar Foreign Keys**

```sql
-- Adicionar FKs após validar integridade
ALTER TABLE payment_transactions
ADD CONSTRAINT fk_payment_transactions_customer
FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE payment_transactions
ADD CONSTRAINT fk_payment_transactions_customer_provider
FOREIGN KEY (customer_provider_id) REFERENCES customer_providers(id) ON DELETE SET NULL;

ALTER TABLE payment_transactions
ADD CONSTRAINT fk_payment_transactions_payment_method
FOREIGN KEY (customer_payment_method_id) REFERENCES customer_payment_methods(id) ON DELETE SET NULL;
```

### **6.3 Deprecar PaymentCustomer**

```sql
-- Renomear tabela antiga (não deletar ainda)
ALTER TABLE payment_customers RENAME TO _deprecated_payment_customers;

-- Comentar para documentar
COMMENT ON TABLE _deprecated_payment_customers IS 
'DEPRECATED: Migrated to customers table. Will be dropped after 90 days (2025-02-XX)';
```

---

## 🚀 ORDEM DE EXECUÇÃO

```bash
# 1. Backup completo
pg_dump $DATABASE_URL > backup_pre_migration_$(date +%Y%m%d).sql

# 2. Executar FASE 1 (adicionar colunas e migrar dados)
psql $DATABASE_URL < migration_phase1.sql

# 3. Verificar e corrigir erros
psql $DATABASE_URL < validation_phase1.sql

# 4. Executar FASE 2 (enums)
psql $DATABASE_URL < migration_phase2.sql

# 5. Executar FASE 3 (payment methods)
psql $DATABASE_URL < migration_phase3.sql

# 6. Executar FASE 4 (subscriptions)
psql $DATABASE_URL < migration_phase4.sql

# 7. Deploy do código novo (usar enums nos novos checkouts)
git deploy production

# 8. Esperar 30 dias

# 9. Executar FASE 5 (auditoria)
psql $DATABASE_URL < validation_final.sql

# 10. Se 100% OK, executar FASE 6 (cleanup)
psql $DATABASE_URL < migration_phase6_cleanup.sql
```

---

## ⚠️ ROLLBACK PLAN

### **Se algo der errado:**

```sql
-- 1. Remover FKs
ALTER TABLE payment_transactions
DROP CONSTRAINT IF EXISTS fk_payment_transactions_customer,
DROP CONSTRAINT IF EXISTS fk_payment_transactions_customer_provider,
DROP CONSTRAINT IF EXISTS fk_payment_transactions_payment_method;

-- 2. Limpar dados migrados (se necessário)
UPDATE payment_transactions
SET 
  customer_id = NULL,
  customer_provider_id = NULL,
  customer_payment_method_id = NULL,
  provider_v2 = NULL,
  status_v2 = NULL
WHERE created_at > '2025-01-XX'; -- data da migration

-- 3. Deletar registros criados
DELETE FROM customer_subscriptions WHERE created_at > '2025-01-XX';
DELETE FROM customer_payment_methods WHERE created_at > '2025-01-XX';
DELETE FROM customer_providers WHERE created_at > '2025-01-XX';
DELETE FROM customers WHERE created_at > '2025-01-XX' AND id NOT IN (
  SELECT id FROM _deprecated_payment_customers
);

-- 4. Restaurar backup
psql $DATABASE_URL < backup_pre_migration_YYYYMMDD.sql
```

---

## 📊 MÉTRICAS DE SUCESSO

Após migração completa, você deve ter:

```sql
-- 1. 100% transações com customer
SELECT COUNT(*) FILTER (WHERE customer_id IS NOT NULL)::float / COUNT(*) * 100 as pct
FROM payment_transactions
WHERE created_at > NOW() - INTERVAL '7 days';
-- Esperado: 100%

-- 2. 100% sessões pagas conectadas
SELECT COUNT(*) FILTER (WHERE payment_transaction_id IS NOT NULL)::float / COUNT(*) * 100
FROM checkout_sessions
WHERE status = 'paid' AND created_at > NOW() - INTERVAL '7 days';
-- Esperado: 100%

-- 3. 100% transações com enum provider
SELECT COUNT(*) FILTER (WHERE provider_v2 IS NOT NULL)::float / COUNT(*) * 100
FROM payment_transactions
WHERE created_at > NOW() - INTERVAL '7 days';
-- Esperado: 100%

-- 4. 0 clientes duplicados
SELECT COUNT(*) FROM (
  SELECT email FROM customers GROUP BY email HAVING COUNT(*) > 1
) dupes;
-- Esperado: 0
```

---

## 🎯 TIMELINE ESTIMADO

| Fase | Duração | Downtime |
|------|---------|----------|
| FASE 1: Preparação | 2-4 horas | ❌ Não |
| FASE 2: Enums | 1-2 horas | ❌ Não |
| FASE 3: Payment Methods | 1-2 horas | ❌ Não |
| FASE 4: Subscriptions | 1 hora | ❌ Não |
| FASE 5: Auditoria | 1 hora | ❌ Não |
| **Deploy código novo** | 30 min | ⚠️ 5-10min |
| FASE 6: Cleanup | 1 hora | ⚠️ 5min |
| **TOTAL** | **8-12 horas** | **10-15min** |

---

## ✅ PRÓXIMA AÇÃO RECOMENDADA

1. **Revisar e ajustar** este plano para sua realidade
2. **Testar em staging** ambiente completo
3. **Criar backup** antes de executar em produção
4. **Executar FASE 1** em horário de baixo tráfego
5. **Monitorar logs** durante execução
6. **Deploy código novo** gradualmente (feature flag)
7. **Auditar resultados** após 7 dias
8. **Cleanup final** após 30 dias
