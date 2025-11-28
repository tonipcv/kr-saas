# 🚀 Migração Webhooks: Worker Manual → Trigger.dev

**Status:** ✅ COMPLETO - Pronto para deploy  
**Data:** 28 de novembro de 2025

---

## 📋 RESUMO EXECUTIVO

Migração **100% completa e segura** do sistema de outbound webhooks do worker manual para Trigger.dev.

### O que mudou

- ✅ **Worker manual** → **Trigger.dev jobs** (retry nativo + dashboard)
- ✅ **Polling SQL** → **Event-driven** (dispara imediatamente)
- ✅ **Sem observabilidade** → **Dashboard completo** (logs, métricas, latência)
- ✅ **Escalabilidade manual** → **Escalabilidade automática**

### O que NÃO mudou

- ✅ **Tabelas do banco** (schema 100% compatível)
- ✅ **Payload format** (specVersion 1.0)
- ✅ **Assinatura HMAC** (SHA-256)
- ✅ **Validações** (HTTPS, tamanho, clinicId)
- ✅ **Filtros de produto** (mantidos)
- ✅ **API pública** (endpoints de gerenciamento)

---

## 🎯 ARQUITETURA

### Antes (Worker Manual)

```
┌─────────────────────────────────────────────────────────┐
│                    FLUXO ANTIGO                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  1. Emissão                                              │
│     onPaymentTransactionStatusChanged()                  │
│     ↓                                                     │
│     Cria PENDING em outbound_webhook_deliveries          │
│                                                           │
│  2. Worker Manual (polling a cada 5s)                    │
│     SELECT ... WHERE status = 'PENDING' ...              │
│     ↓                                                     │
│     deliverOnce() para cada delivery                     │
│     ↓                                                     │
│     Retry manual com backoff                             │
│                                                           │
│  3. Problemas                                            │
│     ❌ Polling desperdiça recursos                       │
│     ❌ Sem observabilidade                               │
│     ❌ Escalabilidade manual                             │
│     ❌ Retry implementado manualmente                    │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### Depois (Trigger.dev)

```
┌─────────────────────────────────────────────────────────┐
│                    FLUXO NOVO                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  1. Emissão (mantém PENDING no DB)                      │
│     onPaymentTransactionStatusChanged()                  │
│     ↓                                                     │
│     Cria PENDING em outbound_webhook_deliveries          │
│     ↓                                                     │
│     tasks.trigger("deliver-webhook", { deliveryId })     │
│                                                           │
│  2. Trigger.dev (event-driven)                           │
│     ↓                                                     │
│     Executa job em worker isolado                        │
│     ↓                                                     │
│     Retry automático nativo (10 tentativas)              │
│     ↓                                                     │
│     Dashboard mostra logs/métricas                       │
│                                                           │
│  3. Safety Net (a cada 5min em produção)                 │
│     check-stuck-deliveries                               │
│     ↓                                                     │
│     Re-dispara PENDING antigas (> 10min)                 │
│                                                           │
│  4. Benefícios                                           │
│     ✅ Event-driven (dispara imediatamente)              │
│     ✅ Dashboard completo                                │
│     ✅ Escalabilidade automática                         │
│     ✅ Retry nativo                                      │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 ARQUIVOS MODIFICADOS/CRIADOS

### ✅ Criados (novos)

```
trigger/deliver-webhook.ts              (job principal de delivery)
trigger/check-stuck-deliveries.ts       (safety net agendado)
docs/WEBHOOKS_TRIGGER_DEV_MIGRATION.md  (este documento)
```

### ✅ Modificados

```
src/lib/webhooks/emit-updated.ts        (+ tasks.trigger())
src/lib/webhooks/bootstrap.ts           (deprecado, mantido para rollback)
```

### ✅ Mantidos (sem alteração)

```
src/lib/webhooks/outbound-worker.ts     (mantido para rollback)
src/lib/webhooks/signature.ts           (HMAC SHA-256)
src/lib/webhooks/payload.ts             (construtor de payload)
src/lib/payments/status-map.ts          (mapeamento de status)
src/lib/webhooks/__tests__/*            (49 testes passando)
```

---

## 🔧 DETALHES TÉCNICOS

### 1. Job Principal: `deliver-webhook.ts`

**Responsabilidade:** Entregar um webhook para um endpoint

**Retry Policy:**
```typescript
retry: {
  maxAttempts: 10,
  factor: 1.8,
  minTimeoutInMs: 60000,      // 1 minuto
  maxTimeoutInMs: 86400000,   // 24 horas
  randomize: true,            // Jitter
}
```

**Fluxo:**
1. Busca delivery + endpoint + event do DB
2. Valida HTTPS (obrigatório)
3. Valida tamanho do payload (max 1MB)
4. Monta payload (formato v1.0)
5. Assina com HMAC SHA-256
6. Faz fetch com timeout de 15s
7. Atualiza status no DB:
   - Sucesso → `DELIVERED`
   - Falha → `PENDING` (Trigger.dev faz retry)
   - Max attempts → `FAILED`

**Idempotência:** `idempotencyKey = deliveryId`

### 2. Safety Net: `check-stuck-deliveries.ts`

**Responsabilidade:** Re-disparar deliveries travadas

**Schedule:** A cada 5 minutos (apenas em produção)

**Critérios:**
- `status = 'PENDING'`
- `createdAt < 10 minutos atrás`
- `updatedAt < 10 minutos atrás`
- `nextAttemptAt <= agora`

**Ação:**
- Se `attempts < 10` → re-dispara job
- Se `attempts >= 10` → marca como `FAILED`

### 3. Emissão: `emit-updated.ts`

**Mudança:**
```typescript
// Antes: apenas criava PENDING
const del = await prisma.outboundWebhookDelivery.create({
  data: { endpointId, eventId, status: 'PENDING', nextAttemptAt: new Date() }
})

// Depois: cria PENDING + dispara job
const del = await prisma.outboundWebhookDelivery.create({
  data: { endpointId, eventId, status: 'PENDING', nextAttemptAt: new Date() }
})

await tasks.trigger('deliver-webhook', { deliveryId: del.id }, {
  idempotencyKey: del.id,
  queue: 'webhooks',
})
```

**Mantém:**
- Criação de `outbound_webhook_events`
- Criação de `outbound_webhook_deliveries` com `PENDING`
- Filtros por produto
- Validação de `clinicId`

---

## 🚦 ROLLBACK PLAN

### Cenário 1: Trigger.dev indisponível

**Sintoma:** Jobs não executam, deliveries ficam PENDING

**Solução:**
1. Setar env var: `OUTBOUND_WEBHOOKS_ENABLED=true`
2. Reiniciar aplicação
3. Worker manual volta a processar PENDING

**Tempo:** < 5 minutos

### Cenário 2: Bug no job Trigger.dev

**Sintoma:** Jobs falham com erro inesperado

**Solução:**
1. Pausar job no dashboard Trigger.dev
2. Setar env var: `OUTBOUND_WEBHOOKS_ENABLED=true`
3. Reiniciar aplicação
4. Corrigir bug e re-deploy

**Tempo:** < 10 minutos

### Cenário 3: Rollback completo

**Sintoma:** Necessidade de voltar ao worker manual permanentemente

**Solução:**
1. Reverter commit da migração
2. Deploy
3. Worker manual volta automaticamente

**Tempo:** < 15 minutos

---

## ✅ CHECKLIST DE DEPLOY

### Pré-Deploy

- [x] Testes unitários passando (49/49)
- [x] Jobs criados (`deliver-webhook`, `check-stuck-deliveries`)
- [x] `emit-updated.ts` modificado
- [x] `bootstrap.ts` atualizado (deprecado)
- [x] Documentação completa

### Deploy

- [ ] **1. Deploy dos jobs no Trigger.dev**
  ```bash
  npx @trigger.dev/cli@latest deploy
  ```
  
- [ ] **2. Verificar jobs no dashboard**
  - Acessar https://cloud.trigger.dev
  - Confirmar que `deliver-webhook` e `check-stuck-deliveries` aparecem
  
- [ ] **3. Deploy da aplicação (Vercel)**
  ```bash
  git push origin main
  # ou
  vercel --prod
  ```
  
- [ ] **4. Verificar env vars**
  - `OUTBOUND_WEBHOOKS_ENABLED` não deve estar setado (ou `false`)
  - Trigger.dev deve estar ativo por padrão

### Pós-Deploy

- [ ] **5. Teste E2E**
  - Criar endpoint apontando para https://webhook.site
  - Fazer checkout de teste
  - Verificar no dashboard Trigger.dev:
    - Job `deliver-webhook` executado
    - Status: sucesso
    - Latência razoável
  - Verificar no webhook.site:
    - Payload recebido
    - Headers corretos (`X-Webhook-Signature`, etc)
    - Assinatura válida

- [ ] **6. Monitorar por 24h**
  - Dashboard Trigger.dev: taxa de sucesso > 95%
  - Logs: sem erros inesperados
  - DB: deliveries sendo marcadas como `DELIVERED`

- [ ] **7. Desabilitar worker manual permanentemente** (opcional)
  - Após 7 dias de estabilidade
  - Remover `src/lib/webhooks/outbound-worker.ts`
  - Remover `src/lib/webhooks/bootstrap.ts`
  - Remover `src/instrumentation.ts` (se não usado para outras coisas)

---

## 📊 MÉTRICAS ESPERADAS

### Antes (Worker Manual)

- **Latência de disparo:** 0-5s (polling interval)
- **Throughput:** ~10 webhooks/segundo
- **Observabilidade:** console.log
- **Retry:** manual (backoff implementado)
- **Escalabilidade:** manual (adicionar workers)

### Depois (Trigger.dev)

- **Latência de disparo:** < 100ms (event-driven)
- **Throughput:** ilimitado (escalabilidade automática)
- **Observabilidade:** dashboard completo
- **Retry:** nativo (10 tentativas automáticas)
- **Escalabilidade:** automática

### KPIs

- **Taxa de sucesso:** > 95%
- **Latência p50:** < 500ms
- **Latência p95:** < 2s
- **Latência p99:** < 5s
- **Deliveries travadas:** < 1% (safety net resolve)

---

## 🔍 DEBUGGING

### Dashboard Trigger.dev

**URL:** https://cloud.trigger.dev

**Visualizar:**
- Execuções recentes (últimas 100)
- Logs completos de cada tentativa
- Input/output de cada job
- Stack traces de erros
- Métricas (taxa de sucesso, latência)

### Logs da Aplicação

**Emissão:**
```
[webhooks] Event created: evt_xxx (payment.transaction.succeeded)
[webhooks] Triggered delivery job for del_xxx
```

**Safety Net:**
```
[Safety Net] Checking for stuck webhook deliveries
[Safety Net] Found 3 stuck deliveries
[Safety Net] Re-triggered delivery del_xxx (attempt 2)
[Safety Net] Summary: 3 retriggered, 0 failed
```

### Queries Úteis

**Deliveries PENDING antigas:**
```sql
SELECT id, created_at, updated_at, attempts, last_error
FROM outbound_webhook_deliveries
WHERE status = 'PENDING'
  AND created_at < NOW() - INTERVAL '10 minutes'
ORDER BY created_at ASC
LIMIT 50;
```

**Taxa de sucesso (últimas 24h):**
```sql
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM outbound_webhook_deliveries
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

**Latência média por endpoint:**
```sql
SELECT 
  e.name,
  e.url,
  COUNT(d.id) as deliveries,
  AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.created_at))) as avg_latency_seconds
FROM outbound_webhook_deliveries d
JOIN webhook_endpoints e ON e.id = d.endpoint_id
WHERE d.status = 'DELIVERED'
  AND d.delivered_at > NOW() - INTERVAL '24 hours'
GROUP BY e.id, e.name, e.url
ORDER BY avg_latency_seconds DESC;
```

---

## 🎯 PRÓXIMOS PASSOS (Futuro)

### Curto Prazo (1-2 semanas)

- [ ] Monitorar métricas e ajustar retry policy se necessário
- [ ] Configurar alertas no Trigger.dev (webhook para Slack)
- [ ] Documentar troubleshooting comum

### Médio Prazo (1-2 meses)

- [ ] Remover worker manual após estabilidade
- [ ] Adicionar testes E2E automatizados
- [ ] Implementar circuit breaker para endpoints problemáticos

### Longo Prazo (3-6 meses)

- [ ] Batch deliveries para mesmo endpoint (otimização)
- [ ] Suporte a webhooks bidirecionais (receber + enviar)
- [ ] Webhooks para outros eventos (não apenas pagamentos)

---

## 📞 SUPORTE

### Problemas Comuns

**1. Job não executa**
- Verificar se job foi deployado: `npx @trigger.dev/cli@latest list`
- Verificar env vars do Trigger.dev
- Verificar logs da emissão

**2. Deliveries ficam PENDING**
- Verificar se safety net está rodando (produção)
- Verificar logs do job no dashboard
- Verificar se endpoint está HTTPS

**3. Taxa de sucesso baixa**
- Verificar endpoints problemáticos (query acima)
- Verificar logs de erro no dashboard
- Considerar aumentar timeout ou retry

### Contatos

- **Trigger.dev Support:** https://trigger.dev/docs
- **Dashboard:** https://cloud.trigger.dev
- **Docs Internas:** `/docs/public/WEBHOOKS_INTEGRATION_GUIDE.md`

---

## 🎉 CONCLUSÃO

Migração **100% completa e segura** para Trigger.dev com:

- ✅ **Zero downtime** (rollback instantâneo)
- ✅ **Zero breaking changes** (schema e API mantidos)
- ✅ **Melhor observabilidade** (dashboard completo)
- ✅ **Melhor escalabilidade** (automática)
- ✅ **Melhor confiabilidade** (retry nativo + safety net)

**Status:** Pronto para deploy! 🚀

---

**Desenvolvido com ❤️ para KrxScale**  
**Versão:** 2.0.0  
**Data:** 28 de novembro de 2025
