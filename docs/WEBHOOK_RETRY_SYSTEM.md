# Sistema de Webhooks com Retry Garantido

## ✅ O que foi implementado

Garantia de que **nenhuma transação será perdida** mesmo em caso de erro temporário, seguindo modelo de providers profissionais como HTPS.io.

### Mudanças aplicadas

#### 1. Stripe (`/api/stripe/webhook`)
**Antes**: Retornava 500 em erro → provider reenviava → duplicação  
**Depois**: 
- ✅ Persiste webhook ANTES de processar (idempotente)
- ✅ SEMPRE retorna 200 (mesmo com erro)
- ✅ Marca para retry via worker se falhar

#### 2. Pagar.me (`/api/payments/pagarme/webhook`)
**Antes**: Modo sync retornava 500 → perdia evento  
**Depois**:
- ✅ SEMPRE retorna 200 (mesmo com erro)
- ✅ Marca para retry via worker se falhar
- ✅ Mantém compatibilidade com modo WEBHOOK_ASYNC

#### 3. Appmax (`/api/webhooks/appmax`)
**Antes**: Retornava 500 em erro → perdia evento  
**Depois**:
- ✅ SEMPRE retorna 200 (mesmo com erro)
- ✅ Marca para retry via worker se falhar

#### 4. Open Finance (`/api/open-finance/webhook`)
**Antes**: Não persistia webhook, retornava 500  
**Depois**:
- ✅ Persiste webhook ANTES de processar
- ✅ SEMPRE retorna 200 (mesmo com erro)
- ✅ Marca para retry via worker se falhar

#### 5. SendPulse (`/api/webhooks/sendpulse`)
**Status**: ✅ JÁ estava correto (retorna 200 sempre)

#### 6. Stripe (novo) (`/api/webhooks/stripe`)
**Status**: ✅ JÁ estava correto (persiste + enfileira)

---

## 🔄 Como funciona o fluxo

### Fluxo Normal (sem erro)
```
1. Provider envia webhook
   ↓
2. Endpoint valida signature
   ↓
3. Persiste em webhook_events (idempotente)
   ↓
4. Processa inline
   ↓
5. Retorna 200 OK (< 200ms)
   ↓
6. Marca processed=true
```

### Fluxo com Erro
```
1. Provider envia webhook
   ↓
2. Endpoint valida signature
   ↓
3. Persiste em webhook_events (idempotente)
   ↓
4. Processa inline
   ↓
5. ❌ ERRO (timeout, DB down, etc)
   ↓
6. Marca next_retry_at=NOW()
   ↓
7. SEMPRE retorna 200 OK
   ↓
8. Worker retenta depois (3x com backoff)
```

---

## 🧪 Como testar

### Teste 1: Simulando erro no processamento

```bash
# 1. Causa erro temporário (ex: desliga Postgres)
# 2. Envia webhook de teste
curl -X POST http://localhost:3000/api/webhooks/stripe \
  -H "stripe-signature: test" \
  -d '{"id":"evt_test","type":"payment_intent.succeeded"}'

# 3. Verifica que retornou 200
# Response: {"received":true,"will_retry":true}

# 4. Verifica na tabela
SELECT * FROM webhook_events WHERE hook_id = 'evt_test';
# processed = false
# next_retry_at = NOW()
# processing_error = "Connection error..."
```

### Teste 2: Worker reprocessando

```bash
# 1. Inicia worker
npm run worker:webhooks

# 2. Worker vai pegar eventos pendentes
# Logs:
# {"event":"worker.processing_start","provider":"stripe","eventId":"evt_test"}
# {"event":"worker.event_processed","webhookId":"..."}

# 3. Verifica na tabela
SELECT processed, retry_count FROM webhook_events WHERE hook_id = 'evt_test';
# processed = true
# retry_count = 1 (se teve retry) ou 0 (se sucesso direto)
```

### Teste 3: Idempotência (webhook duplicado)

```bash
# 1. Envia mesmo webhook 2x
curl -X POST http://localhost:3000/api/webhooks/stripe \
  -H "stripe-signature: test" \
  -d '{"id":"evt_same","type":"payment_intent.succeeded"}'

# 2. Envia de novo
curl -X POST http://localhost:3000/api/webhooks/stripe \
  -H "stripe-signature: test" \
  -d '{"id":"evt_same","type":"payment_intent.succeeded"}'

# 3. Verifica na tabela - só 1 registro
SELECT COUNT(*) FROM webhook_events WHERE hook_id = 'evt_same';
# COUNT = 1 (ON CONFLICT DO NOTHING funcionou)
```

---

## 📊 Monitoramento

### Queries úteis

#### Webhooks pendentes (aguardando retry)
```sql
SELECT provider, type, retry_count, processing_error, next_retry_at
FROM webhook_events
WHERE processed = false 
  AND is_retryable = true
ORDER BY next_retry_at ASC
LIMIT 10;
```

#### Webhooks na Dead Letter Queue (max retries)
```sql
SELECT provider, type, retry_count, processing_error, dead_letter_reason, received_at
FROM webhook_events
WHERE moved_dead_letter = true
ORDER BY received_at DESC
LIMIT 20;
```

#### Taxa de sucesso por provider (últimas 24h)
```sql
SELECT 
  provider,
  COUNT(*) as total,
  SUM(CASE WHEN processed = true THEN 1 ELSE 0 END) as processed,
  ROUND(100.0 * SUM(CASE WHEN processed = true THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM webhook_events
WHERE received_at > NOW() - INTERVAL '24 hours'
GROUP BY provider
ORDER BY provider;
```

#### Webhooks com retry (precisaram de 2+ tentativas)
```sql
SELECT provider, type, retry_count, processing_error
FROM webhook_events
WHERE retry_count > 0
  AND processed = true
ORDER BY received_at DESC
LIMIT 10;
```

---

## ⚙️ Configuração do Worker

### Iniciar worker

```bash
# Via npm script
npm run worker:webhooks

# Via ts-node direto
ts-node workers/webhook-processor.ts

# Docker
docker-compose up webhook-worker
```

### Configurações (via env vars)

```bash
# Tamanho do batch (eventos processados por vez)
WEBHOOK_WORKER_BATCH_SIZE=10

# Backoff inicial (ms)
WEBHOOK_WORKER_BACKOFF_MS=1000

# Sleep quando fila vazia (ms)
WEBHOOK_WORKER_SLEEP_MS=1000
```

### Múltiplos workers (scale horizontal)

```bash
# Terminal 1
WORKER_ID=1 npm run worker:webhooks

# Terminal 2
WORKER_ID=2 npm run worker:webhooks

# FOR UPDATE SKIP LOCKED garante que não processam o mesmo evento
```

---

## 🔍 Troubleshooting

### Webhook não foi processado após 24h

1. Verifique se está marcado como `is_retryable=false`:
```sql
SELECT * FROM webhook_events WHERE hook_id = 'evt_xxx';
```

2. Se `moved_dead_letter=true`, foi para DLQ após 3 retries
3. Ver erro: `processing_error` field
4. Reprocessar manualmente:
```sql
UPDATE webhook_events 
SET processed = false, 
    retry_count = 0, 
    is_retryable = true,
    moved_dead_letter = false,
    next_retry_at = NOW()
WHERE hook_id = 'evt_xxx';
```

### Worker não está pegando webhooks

1. Verifica se tem pendentes:
```sql
SELECT COUNT(*) FROM webhook_events 
WHERE processed = false AND next_retry_at <= NOW();
```

2. Verifica se worker está rodando:
```bash
ps aux | grep webhook-processor
```

3. Checa logs do worker
4. Testa manualmente:
```typescript
import { runWebhookWorker } from '@/lib/queue/pgboss'
runWebhookWorker({ batchSize: 1 })
```

---

## 🎯 Garantias do Sistema

### ✅ Garantias FORTES

1. **Zero perda de eventos**: Webhook é persistido ANTES de processar
2. **Idempotência**: ON CONFLICT DO NOTHING previne duplicatas
3. **Retry automático**: Worker retenta até 3x com backoff exponencial
4. **Provider não reenvia**: SEMPRE retorna 200, evita duplicação

### ⚠️ Limitações conhecidas

1. **Max 3 retries**: Após isso, vai para DLQ (precisa ação manual)
2. **Backoff fixo**: 5min entre retries (não é exponencial ainda no worker)
3. **Sem alertas automáticos**: DLQ crescendo precisa monitoramento manual

---

## 📈 Próximos Passos (Future)

- [ ] Dashboard de métricas (Grafana)
- [ ] Alertas automáticos (DLQ > 100 eventos)
- [ ] Backoff exponencial no worker (1s, 2s, 4s, 8s...)
- [ ] Admin UI para reprocessar DLQ em bulk
- [ ] Circuit breaker (pause se erro rate > 50%)

---

**Última atualização**: 19 de Novembro de 2024  
**Autor**: Payment Orchestration Team
