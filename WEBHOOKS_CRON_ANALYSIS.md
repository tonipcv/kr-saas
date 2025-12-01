# Análise Completa: Duplicação de Crons e Workers de Webhooks

## Resumo Executivo

Identificamos **3 sistemas concorrentes** para processar webhooks outbound, criando duplicação, confusão e risco de processamento duplo:

1. **Worker manual legado** (`src/lib/webhooks/outbound-worker.ts`)
2. **Trigger.dev tasks** (`trigger/deliver-webhook.ts`, `trigger/check-stuck-deliveries.ts`)
3. **Rotas nativas Vercel** (`src/app/api/webhooks/deliver`, `pump`, `retry-stuck`) + GitHub Actions

---

## 1. Inventário Completo

### 1.1 Worker Manual Legado

**Arquivos:**
- `src/lib/webhooks/outbound-worker.ts` - Worker com loop infinito + backoff
- `src/lib/webhooks/bootstrap.ts` - Bootstrap condicional
- `src/app/api/cron/webhooks/route.ts` - Endpoint GET para iniciar worker

**Ativação:**
- Requer `OUTBOUND_WEBHOOKS_ENABLED=true`
- Chamada manual a `GET /api/cron/webhooks`
- Roda em processo Node.js da aplicação

**Características:**
- Loop infinito com `SELECT ... FOR UPDATE SKIP LOCKED`
- Backoff: `[0, 60, 300, 900, 3600, 21600, 86400, 86400, 86400, 86400]` segundos
- Respeita `max_concurrent_deliveries` por endpoint
- Batch size: 10 deliveries por iteração
- Sleep: 5 segundos entre iterações

**Status:** Marcado como `@deprecated` mas ainda funcional

---

### 1.2 Trigger.dev Tasks

**Arquivos:**
- `trigger/deliver-webhook.ts` - Task principal de delivery
- `trigger/check-stuck-deliveries.ts` - Safety net scheduled task

**Configuração:**

**`deliver-webhook`:**
- ID: `"deliver-webhook"`
- Retry: 10 tentativas, factor 1.8, min 60s, max 24h
- Queue: `"webhooks"`
- Triggered por: `src/lib/webhooks/emit-updated.ts` (quando `WEBHOOKS_USE_NATIVE !== 'true'`)

**`check-stuck-deliveries`:**
- ID: `"check-stuck-deliveries"`
- Cron: `*/5 * * * *` (a cada 5 minutos)
- Timezone: `America/Sao_Paulo`
- Environments: `["PRODUCTION"]`
- Lógica:
  - Busca deliveries `PENDING` há >10 min sem update
  - Re-dispara `deliver-webhook` com novo idempotency key
  - Marca como `FAILED` se `attempts >= 10`

**Outros schedules Trigger.dev (não relacionados a webhooks):**
- `billing-scheduler` - `0 * * * *` (hourly)
- `expiring-cards-notifier` - `0 10 * * 1` (segunda 10h)
- `daily-billing-renewal` - `0 9 * * *` (diário 9h)

**Status:** Ativo quando `WEBHOOKS_USE_NATIVE !== 'true'`

---

### 1.3 Rotas Nativas Vercel + GitHub Actions

**Arquivos:**
- `src/app/api/webhooks/deliver/route.ts` - POST delivery único
- `src/app/api/webhooks/pump/route.ts` - POST pump batch
- `src/app/api/webhooks/retry-stuck/route.ts` - POST safety net
- `.github/workflows/webhooks-pump.yml` - GitHub Actions cron

**Configuração:**

**`/api/webhooks/deliver`:**
- Processa 1 delivery por vez
- Backoff: `[60, 300, 900, 3600, 21600, 86400, 172800, 259200, 345600]` segundos
- Max attempts: 10
- Timeout: 15s

**`/api/webhooks/pump`:**
- Autorização: `x-vercel-cron` ou `x-cron-secret`
- Busca deliveries `PENDING` com `nextAttemptAt <= now OR null`
- Limit: `WEBHOOKS_PUMP_LIMIT` (default 25)
- Fan-out: chama `/api/webhooks/deliver` para cada delivery

**`/api/webhooks/retry-stuck`:**
- Autorização: `x-vercel-cron` ou `x-cron-secret`
- Marca `FAILED`: deliveries com `attempts >= 10`
- Reschedula: deliveries `PENDING` antigas (>24h por padrão)
- Limit: 200 por execução

**GitHub Actions:**
- Workflow: `.github/workflows/webhooks-pump.yml`
- Schedule: `*/5 * * * *` (a cada 5 minutos)
- Calls:
  - `POST {APP_BASE_URL}/api/webhooks/pump`
  - `POST {APP_BASE_URL}/api/webhooks/retry-stuck`
- Secrets: `APP_BASE_URL`, `WEBHOOKS_CRON_SECRET`

**Status:** Ativo quando `WEBHOOKS_USE_NATIVE=true` e GitHub Actions configurado

---

## 2. Matriz de Duplicação

| Funcionalidade | Worker Legado | Trigger.dev | Vercel Native |
|---|---|---|---|
| **Delivery único** | ✅ `deliverOnce()` | ✅ `deliver-webhook` task | ✅ `POST /api/webhooks/deliver` |
| **Pump/batch** | ✅ Loop infinito | ❌ (trigger individual) | ✅ `POST /api/webhooks/pump` |
| **Safety net** | ❌ | ✅ `check-stuck-deliveries` | ✅ `POST /api/webhooks/retry-stuck` |
| **Backoff** | 10 níveis | 10 tentativas (Trigger.dev) | 9 níveis |
| **Cron** | Manual (loop) | Trigger.dev schedule | GitHub Actions |
| **Concurrency control** | ✅ `max_concurrent_deliveries` | ❌ | ❌ |
| **HTTPS validation** | ✅ | ✅ | ✅ |
| **Payload size limit** | ✅ 1MB | ✅ 1MB | ✅ 1MB |
| **HMAC signature** | ✅ | ✅ | ✅ |
| **Idempotency** | DB-based | Trigger.dev idempotency key | DB-based |

---

## 3. Problemas Identificados

### 3.1 Risco de Processamento Duplo

**Cenário 1:** Worker legado + Trigger.dev ativos simultaneamente
- `OUTBOUND_WEBHOOKS_ENABLED=true` + Trigger.dev deploy ativo
- Ambos processam mesma delivery
- Possível duplicação de webhooks enviados

**Cenário 2:** Trigger.dev + Vercel Native ativos
- `emit-updated.ts` dispara Trigger.dev quando `WEBHOOKS_USE_NATIVE !== 'true'`
- Mas `check-stuck-deliveries` (Trigger.dev) continua rodando
- GitHub Actions pump também roda
- 2-3 sistemas competindo pela mesma delivery

**Cenário 3:** Todos ativos
- Worker legado via `GET /api/cron/webhooks`
- Trigger.dev tasks rodando
- GitHub Actions chamando pump/retry-stuck
- Caos total

### 3.2 Inconsistência de Backoff

- **Worker legado:** 10 níveis, max 24h (86400s)
- **Trigger.dev:** factor 1.8, min 60s, max 24h
- **Vercel native:** 9 níveis, max 96h (345600s)

Deliveries podem ter comportamentos diferentes dependendo de qual sistema as processa.

### 3.3 Falta de Controle de Concorrência

- Worker legado respeita `max_concurrent_deliveries`
- Trigger.dev e Vercel native ignoram esse campo
- Risco de sobrecarregar endpoints de clientes

### 3.4 Complexidade Operacional

- 3 sistemas para monitorar
- 3 conjuntos de logs
- 3 pontos de falha
- Difícil debugar qual sistema processou qual delivery

### 3.5 Custos Desnecessários

- Trigger.dev cobra por execução (se ultrapassar free tier)
- GitHub Actions é gratuito mas limitado
- Worker legado consome recursos da aplicação

---

## 4. Estado Atual do Emissor

**Arquivo:** `src/lib/webhooks/emit-updated.ts`

**Lógica atual:**
```typescript
// Cria delivery
const del = await prisma.outboundWebhookDelivery.create({...})

// Nativo (Vercel): disparo best-effort imediato; pump cobre o restante
if (process.env.WEBHOOKS_USE_NATIVE === 'true' && process.env.APP_BASE_URL) {
  await fetch(`${APP_BASE_URL}/api/webhooks/deliver`, {
    method: 'POST',
    body: JSON.stringify({ deliveryId: del.id }),
  })
}
```

**Problema:** Código antigo de Trigger.dev foi removido, mas:
- `trigger/deliver-webhook.ts` ainda exporta o task (reativado no commit `risk 13`)
- `trigger/check-stuck-deliveries.ts` continua ativo e scheduled
- Nenhum código dispara Trigger.dev, mas os tasks existem no deploy

---

## 5. Solução Proposta

### 5.1 Escolher UM Sistema (Recomendação: Vercel Native + GitHub Actions)

**Motivos:**
- ✅ **Gratuito:** GitHub Actions free tier é suficiente
- ✅ **Simples:** Sem dependências externas (Trigger.dev)
- ✅ **Stateless:** Rotas Next.js são fáceis de debugar
- ✅ **Escalável:** Vercel escala automaticamente
- ✅ **Observável:** Logs centralizados no Vercel

**Contra Trigger.dev:**
- ❌ Custo adicional em produção
- ❌ Complexidade de deploy/config
- ❌ Problemas com Prisma engines (já enfrentados)

**Contra Worker Legado:**
- ❌ Roda no processo da app (consome recursos)
- ❌ Não escala horizontalmente
- ❌ Difícil monitorar

### 5.2 Plano de Limpeza

#### Passo 1: Desativar Worker Legado
- [ ] Remover `src/app/api/cron/webhooks/route.ts`
- [ ] Marcar `src/lib/webhooks/outbound-worker.ts` como deprecated (já está)
- [ ] Marcar `src/lib/webhooks/bootstrap.ts` como deprecated (já está)
- [ ] Garantir `OUTBOUND_WEBHOOKS_ENABLED` ausente ou `false` em todos ambientes

#### Passo 2: Desativar Trigger.dev Webhooks
- [ ] Remover export de `trigger/deliver-webhook.ts` (mudar para `const` local)
- [ ] Remover export de `trigger/check-stuck-deliveries.ts` (mudar para `const` local)
- [ ] Ou deletar ambos arquivos completamente
- [ ] Manter outros schedules Trigger.dev (billing, cards, etc.)

#### Passo 3: Consolidar Vercel Native
- [ ] Garantir rotas ativas:
  - `src/app/api/webhooks/deliver/route.ts`
  - `src/app/api/webhooks/pump/route.ts`
  - `src/app/api/webhooks/retry-stuck/route.ts`
- [ ] Garantir GitHub Actions workflow ativo:
  - `.github/workflows/webhooks-pump.yml`
- [ ] Configurar secrets no GitHub:
  - `APP_BASE_URL`
  - `WEBHOOKS_CRON_SECRET`
- [ ] Configurar envs no Vercel:
  - `APP_BASE_URL`
  - `WEBHOOKS_USE_NATIVE=true`
  - `WEBHOOKS_CRON_SECRET`
  - `WEBHOOKS_PUMP_LIMIT=25` (opcional)
  - `WEBHOOKS_STUCK_MAX_AGE_MS=86400000` (opcional)

#### Passo 4: Adicionar Controle de Concorrência (Opcional)
- [ ] Implementar respeito a `max_concurrent_deliveries` em `pump/route.ts`
- [ ] Usar query similar ao worker legado:
```sql
WITH endpoint_counts AS (
  SELECT endpoint_id, COUNT(*) as in_flight
  FROM outbound_webhook_deliveries
  WHERE status = 'PENDING' AND updated_at > NOW() - INTERVAL '5 minutes'
  GROUP BY endpoint_id
)
SELECT d.id
FROM outbound_webhook_deliveries d
JOIN webhook_endpoints e ON e.id = d.endpoint_id
LEFT JOIN endpoint_counts ec ON ec.endpoint_id = d.endpoint_id
WHERE d.status = 'PENDING'
  AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW())
  AND COALESCE(ec.in_flight, 0) < e.max_concurrent_deliveries
ORDER BY d.created_at ASC
LIMIT 25
```

#### Passo 5: Documentação e Testes
- [ ] Atualizar `WEBHOOKS_VERCEL_MVP.md` com decisão final
- [ ] Criar doc de rollback (se necessário voltar ao Trigger.dev)
- [ ] Testar end-to-end:
  - Criar evento
  - Verificar delivery criado
  - Aguardar GitHub Actions rodar
  - Confirmar webhook entregue
  - Testar retry manual via `POST /api/webhooks/deliver`

---

## 6. Arquivos a Remover/Modificar

### Remover Completamente
- `src/app/api/cron/webhooks/route.ts` (worker legado)
- `trigger/deliver-webhook.ts` (ou desexportar)
- `trigger/check-stuck-deliveries.ts` (ou desexportar)

### Manter como Referência (Deprecated)
- `src/lib/webhooks/outbound-worker.ts`
- `src/lib/webhooks/bootstrap.ts`

### Manter Ativos
- `src/app/api/webhooks/deliver/route.ts`
- `src/app/api/webhooks/pump/route.ts`
- `src/app/api/webhooks/retry-stuck/route.ts`
- `.github/workflows/webhooks-pump.yml`
- `src/lib/webhooks/emit-updated.ts` (já migrado)

### Outros Trigger.dev (NÃO TOCAR)
- `trigger/billing-renewal.ts`
- `trigger/billing-scheduler.ts`
- `trigger/expiring-cards-notifier.ts`
- `trigger/db-health.ts`

---

## 7. Configuração Final Recomendada

### Envs Vercel (Production)
```bash
DATABASE_URL=postgresql://...
APP_BASE_URL=https://seu-app.vercel.app
WEBHOOKS_USE_NATIVE=true
WEBHOOKS_CRON_SECRET=<random-32-chars>
WEBHOOKS_PUMP_LIMIT=25
WEBHOOKS_STUCK_MAX_AGE_MS=86400000
# NÃO setar OUTBOUND_WEBHOOKS_ENABLED
```

### Secrets GitHub
```
APP_BASE_URL = https://seu-app.vercel.app
WEBHOOKS_CRON_SECRET = <mesmo-valor-do-vercel>
```

### GitHub Actions
- Workflow: `.github/workflows/webhooks-pump.yml`
- Schedule: `*/5 * * * *`
- Calls: pump + retry-stuck

---

## 8. Riscos e Mitigações

### Risco 1: GitHub Actions falha
**Mitigação:** 
- Deliveries ficam `PENDING` mas não são perdidas
- Próxima execução (5 min) as processa
- Adicionar alerta se >100 deliveries `PENDING` por >30 min

### Risco 2: Rate limit de endpoints
**Mitigação:**
- Implementar controle de concorrência (passo 4)
- Ajustar `WEBHOOKS_PUMP_LIMIT` conforme carga

### Risco 3: Vercel cold start
**Mitigação:**
- Rotas são stateless, cold start não afeta deliveries
- Timeout de 15s é suficiente mesmo com cold start

---

## 9. Checklist de Migração

- [ ] **1. Backup:** Exportar deliveries `PENDING` atuais
- [ ] **2. Deploy:** Garantir rotas Vercel ativas
- [ ] **3. GitHub:** Configurar secrets e ativar workflow
- [ ] **4. Vercel:** Configurar envs
- [ ] **5. Desativar:** Worker legado (`OUTBOUND_WEBHOOKS_ENABLED` ausente)
- [ ] **6. Desativar:** Trigger.dev webhooks (desexportar tasks)
- [ ] **7. Testar:** Criar evento e verificar delivery
- [ ] **8. Monitorar:** Logs por 24h
- [ ] **9. Limpar:** Remover arquivos deprecated após 1 semana estável
- [ ] **10. Documentar:** Atualizar READMEs e guias

---

## 10. Conclusão

**Situação atual:** 3 sistemas concorrentes, risco de duplicação, complexidade desnecessária.

**Solução:** Consolidar em Vercel Native + GitHub Actions.

**Benefícios:**
- ✅ Gratuito
- ✅ Simples
- ✅ Escalável
- ✅ Observável
- ✅ Sem dependências externas

**Próximo passo:** Executar checklist de migração acima.
