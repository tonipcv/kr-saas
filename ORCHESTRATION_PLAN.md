# Plano de Transformação: Payment Orchestration Completo
## 🎯 OBJETIVO
Tornar o sistema uma payment orchestration completa SEM quebrar o que funciona.

## 📊 DIAGNÓSTICO (baseado no audit_report.js)

### Dados reais do sistema:
- **331 transações** (30 dias): 208 Pagarme, 54 Appmax, 42 Open Banking, 27 Stripe
- **R$ 534.136,62** sem rastreamento de customer (100% das transações)
- **0%** usando enums `provider_v2` e `status_v2`
- **0%** com `customer_id` preenchido
- **13 payment_customers** vs **3 customers** (estrutura antiga vs nova)
- **76.88%** com `routed_provider` (único campo relativamente preenchido)
- **14 checkout_sessions** sem link com transactions

### Status atual: 🚨🚨🚨 (3 críticos)

---

## 🎯 ESTRATÉGIA: Progressive Enhancement

### Princípios:
1. **Additive Only**: Nunca remover código que funciona
2. **Feature Flags**: Novos caminhos opcionais primeiro
3. **Dual Write**: Escrever novo + antigo simultaneamente
4. **Gradual Rollout**: 1% → 10% → 50% → 100%
5. **Backwards Compatible**: APIs antigas continuam funcionando

---

## 📋 FASES DE EXECUÇÃO

### **FASE 0: PREPARAÇÃO (HOJ)** ✅ Começar agora
**Objetivo**: Adicionar estrutura sem quebrar nada
**Tempo**: 2-3 horas
**Downtime**: Zero

#### Ações:
- [x] Criar migration: adicionar colunas opcionais
- [ ] Popular campos com dados históricos (migration SQL)
- [ ] Criar helper functions para mapeamento
- [ ] Testes unitários dos helpers

**Deploy**: Pode deployar a qualquer momento (só adiciona colunas)

---

### **FASE 1: DUAL WRITE (SEMANA 1)** 🔄
**Objetivo**: Novos checkouts gravam em ambos os sistemas
**Tempo**: 1 semana
**Downtime**: Zero

#### Ações:
- [ ] Feature flag `ENABLE_UNIFIED_CUSTOMER` (default: false)
- [ ] Criar `CustomerService` (upsert unificado)
- [ ] Atualizar Pagarme checkout para dual write
- [ ] Atualizar Stripe checkout para dual write
- [ ] Atualizar Open Finance para dual write
- [ ] Monitorar erros (não bloquear se novo sistema falhar)

**Deploy**: Gradual com flag OFF → ON 1% → ON 10% → ON 100%

---

### **FASE 2: ENUMS E NORMALIZAÇÃO (SEMANA 2)** 🎨
**Objetivo**: Padronizar provider e status
**Tempo**: 1 semana
**Downtime**: Zero

#### Ações:
- [ ] Criar `ProviderMapper` (string → enum)
- [ ] Criar `StatusMapper` (cada gateway → PaymentStatus)
- [ ] Atualizar checkouts para usar enums
- [ ] Criar índices em provider_v2, status_v2
- [ ] Dashboard: filtrar por enum (fallback para string)

**Deploy**: Gradual (não quebra queries antigas)

---

### **FASE 3: ORCHESTRATION LAYER (SEMANA 3-4)** 🎼
**Objetivo**: Roteamento inteligente e retry cross-gateway
**Tempo**: 2 semanas
**Downtime**: Zero

#### Ações:
- [ ] Implementar `PaymentRouter` (lê PaymentRoutingRule)
- [ ] Implementar `PaymentRetry` (usa CustomerPaymentMethod)
- [ ] Criar endpoint `/api/v2/payments/create` (unificado)
- [ ] Migrar front-end para usar novo endpoint (gradual)
- [ ] Dashboard de routing rules
- [ ] Testes de fallback entre gateways

**Deploy**: Novo endpoint convive com antigos

---

### **FASE 4: OBSERVABILIDADE (SEMANA 5)** 📊
**Objetivo**: Métricas e alertas
**Tempo**: 1 semana
**Downtime**: Zero

#### Ações:
- [ ] Dashboard: taxa de sucesso por gateway
- [ ] Dashboard: custo efetivo (routing optimization)
- [ ] Alertas: gateway down, fallback ativado
- [ ] Logs estruturados (trace_id por transação)
- [ ] Relatório: qual gateway é mais barato/rápido

**Deploy**: Só observabilidade, não afeta fluxo

---

### **FASE 5: CLEANUP (MÊS 2)** 🧹
**Objetivo**: Remover código legado
**Tempo**: 2 semanas
**Downtime**: Mínimo (5-10 min)

#### Ações:
- [ ] Deprecar endpoints antigos (avisar 30 dias antes)
- [ ] Tornar customer_id NOT NULL (se 100% populado)
- [ ] Remover feature flags
- [ ] Deletar payment_customers (backup antes)
- [ ] Documentação final

**Deploy**: Coordenado (após 100% no novo sistema)

---

## 🚀 COMEÇANDO AGORA: FASE 0

Vou executar as ações da FASE 0 imediatamente:

### 0.1 ✅ Migration: Adicionar Colunas Opcionais
- Arquivo: `prisma/migrations/YYYYMMDD_add_orchestration_fields/migration.sql`
- Adiciona: índices, colunas opcionais
- **Risco**: Zero (só adiciona)

### 0.2 Backfill Histórico
- Script: `scripts/migrations/backfill_customer_ids.js`
- Popula customer_id de dados existentes
- **Risco**: Baixo (não afeta fluxo novo)

### 0.3 Helper Functions
- Arquivo: `lib/payments/domain/mapper.ts`
- Funções puras de mapeamento
- **Risco**: Zero (não usado ainda)

### 0.4 Testes
- Arquivo: `lib/payments/domain/mapper.test.ts`
- Valida mapeamentos
- **Risco**: Zero

---

## 📊 MÉTRICAS DE SUCESSO POR FASE

### FASE 0:
- ✅ Colunas adicionadas sem erro
- ✅ Backfill popula 80%+ dos customer_ids históricos
- ✅ Helpers passam 100% testes

### FASE 1:
- ✅ 100% novos checkouts gravam customer_id
- ✅ 0 erros bloqueantes (dual write não falha transação)
- ✅ <5ms overhead

### FASE 2:
- ✅ 100% provider_v2 preenchido (novos)
- ✅ 100% status_v2 preenchido (novos)
- ✅ Dashboards funcionam com enums

### FASE 3:
- ✅ Routing rules aplicadas em 100%
- ✅ Retry cross-gateway funciona
- ✅ Taxa de sucesso +5% (por fallback)

### FASE 4:
- ✅ Dashboards atualizam real-time
- ✅ Alertas disparam <1 min
- ✅ Trace completo de ponta a ponta

### FASE 5:
- ✅ 0 requests em endpoints antigos
- ✅ customer_id NOT NULL sem erro
- ✅ Sistema 100% orquestração

---

## ⚠️ RISCOS E MITIGAÇÕES

### Risco 1: Dual write falha e bloqueia checkout
**Mitigação**: Try/catch com fallback silencioso + log
```typescript
try {
  await createUnifiedCustomer(...)
} catch (e) {
  console.error('Unified customer failed (non-blocking)', e)
  // Continua fluxo antigo
}
```

### Risco 2: Backfill corrompe dados
**Mitigação**: Dry-run primeiro + backup + rollback script

### Risco 3: Performance degradation
**Mitigação**: Índices antes, queries otimizadas, monitorar P95

### Risco 4: Gateway específico quebra com novo formato
**Mitigação**: Testes E2E por gateway + canary deploy

---

## 🎯 TIMELINE REALISTA

| Fase | Início | Fim | Deploy |
|------|--------|-----|--------|
| FASE 0 | Hoje | Hoje +3h | Hoje EOD |
| FASE 1 | Semana 1 | Semana 1 | Gradual (7 dias) |
| FASE 2 | Semana 2 | Semana 2 | Gradual (7 dias) |
| FASE 3 | Semana 3 | Semana 4 | Gradual (14 dias) |
| FASE 4 | Semana 5 | Semana 5 | Imediato |
| FASE 5 | Semana 8 | Semana 10 | Coordenado |

**Total**: ~2.5 meses para 100% payment orchestration

---

## ✅ CHECKLIST PRÉ-DEPLOY (CADA FASE)

- [ ] Testes unitários passam
- [ ] Testes E2E passam (Pagarme, Stripe, Open Finance)
- [ ] Rollback script pronto
- [ ] Feature flag implementada
- [ ] Monitoramento configurado
- [ ] Documentação atualizada
- [ ] Code review aprovado
- [ ] Deploy em staging OK
- [ ] Canary 1% → 10% → 50% → 100%

---

## 🚨 CRITÉRIOS DE ROLLBACK

Se qualquer métrica abaixo falhar, rollback imediato:

1. **Taxa de erro checkout** > baseline +5%
2. **P95 latency** > baseline +50ms
3. **Taxa de sucesso pagamento** < baseline -2%
4. **Dados inconsistentes** (customer_id null em novos)
5. **Gateway específico falhando** 100%

---

## 📞 COMUNICAÇÃO

### Stakeholders:
- **Tech Lead**: Aprovar arquitetura (FASE 0)
- **Product**: Validar features (FASE 3)
- **Ops**: Deploy gradual (TODAS)
- **Finance**: Reconciliação (FASE 5)

### Updates:
- **Daily**: Status no Slack
- **Weekly**: Demo de progresso
- **Incidents**: Imediato + post-mortem

---

## 🎉 RESULTADO FINAL

Após 2.5 meses:

- ✅ 100% transações com customer unificado
- ✅ Retry cross-gateway automático
- ✅ Roteamento inteligente (menor custo/maior taxa sucesso)
- ✅ Dashboards em tempo real
- ✅ Código limpo (sem legado)
- ✅ Pronto para adicionar novos gateways em 1 dia

**Sistema atual**: Collection of integrations
**Sistema final**: True Payment Orchestration Platform
