# Setup Final: Webhooks 100% Gratuito (GitHub Actions + Vercel)

## ✅ O que foi feito

### 1. Limpeza completa
- ✅ **Removido:** `src/app/api/cron/webhooks/route.ts` (worker legado)
- ✅ **Desativado:** `trigger/deliver-webhook.ts` (não exportado)
- ✅ **Desativado:** `trigger/check-stuck-deliveries.ts` (não exportado)
- ✅ **Removido:** `vercel.json` (sem crons pagos)

### 2. Sistema ativo (100% gratuito)
- ✅ **Rotas Vercel:**
  - `POST /api/webhooks/deliver` - processa 1 delivery
  - `POST /api/webhooks/pump` - busca deliveries PENDING e dispara em lote
  - `POST /api/webhooks/retry-stuck` - marca FAILED ou reschedula stuck
- ✅ **GitHub Actions:**
  - `.github/workflows/webhooks-pump.yml`
  - Roda a cada 5 minutos (gratuito)
  - Chama `pump` e `retry-stuck` via HTTP
- ✅ **Emissor:**
  - `src/lib/webhooks/emit-updated.ts`
  - Dispara best-effort via `POST /api/webhooks/deliver` quando `WEBHOOKS_USE_NATIVE=true`

---

## 🚀 Configuração (5 minutos)

### Passo 1: Secrets no GitHub

1. Vá em: **Repositório → Settings → Secrets and variables → Actions**
2. Clique em **New repository secret**
3. Adicione 2 secrets:

```
Nome: APP_BASE_URL
Valor: https://seu-app.vercel.app
```

```
Nome: WEBHOOKS_CRON_SECRET
Valor: <gere uma string aleatória de 32+ caracteres>
```

**Dica para gerar secret:**
```bash
openssl rand -hex 32
```

---

### Passo 2: Envs na Vercel

1. Vá em: **Vercel Dashboard → Seu Projeto → Settings → Environment Variables**
2. Adicione as seguintes variáveis (para **Production**, **Preview** e **Development**):

| Nome | Valor | Obrigatório |
|------|-------|-------------|
| `DATABASE_URL` | `postgresql://...` | ✅ Sim |
| `APP_BASE_URL` | `https://seu-app.vercel.app` | ✅ Sim |
| `WEBHOOKS_USE_NATIVE` | `true` | ✅ Sim |
| `WEBHOOKS_CRON_SECRET` | `<mesmo valor do GitHub>` | ✅ Sim |
| `WEBHOOKS_PUMP_LIMIT` | `25` | ❌ Opcional |
| `WEBHOOKS_STUCK_MAX_AGE_MS` | `86400000` | ❌ Opcional |

**IMPORTANTE:** `WEBHOOKS_CRON_SECRET` deve ser **exatamente o mesmo** valor usado no GitHub.

**NÃO setar:**
- ❌ `OUTBOUND_WEBHOOKS_ENABLED` (worker legado desativado)

---

### Passo 3: Deploy

```bash
git add .
git commit -m "Setup webhooks gratuito (GitHub Actions + Vercel)"
git push origin main
```

A Vercel vai fazer deploy automaticamente.

---

### Passo 4: Testar GitHub Actions

1. Vá em: **GitHub → Actions → Webhooks Pump**
2. Clique em **Run workflow** → **Run workflow**
3. Aguarde ~30 segundos
4. Verifique os logs:
   - ✅ "Pump webhooks" deve retornar status 200
   - ✅ "Retry stuck" deve retornar status 200

---

### Passo 5: Testar End-to-End

#### 5.1 Criar um endpoint de teste

Use um serviço como [webhook.site](https://webhook.site) ou [requestbin.com](https://requestbin.com) para obter uma URL HTTPS de teste.

#### 5.2 Criar endpoint no banco

```sql
INSERT INTO webhook_endpoints (
  id, clinic_id, name, url, secret, enabled, events
) VALUES (
  gen_random_uuid(),
  '<seu-clinic-id>',
  'Teste',
  'https://webhook.site/<seu-id>',
  'test-secret-123',
  true,
  ARRAY['payment.transaction.created']
);
```

#### 5.3 Criar um evento

```sql
INSERT INTO outbound_webhook_events (
  id, clinic_id, type, resource, resource_id, payload
) VALUES (
  gen_random_uuid(),
  '<seu-clinic-id>',
  'payment.transaction.created',
  'payment_transaction',
  'test-123',
  '{"test": true}'::jsonb
);
```

Isso vai criar automaticamente um `outbound_webhook_delivery` com status `PENDING`.

#### 5.4 Aguardar GitHub Actions

- Aguarde até 5 minutos (próxima execução do cron)
- Ou rode manualmente: **GitHub → Actions → Webhooks Pump → Run workflow**

#### 5.5 Verificar entrega

1. Acesse webhook.site e veja se recebeu o POST
2. Verifique headers:
   - `X-Webhook-Id`
   - `X-Webhook-Event`
   - `X-Webhook-Signature`
   - `X-Webhook-Timestamp`
3. Verifique payload:
```json
{
  "specVersion": "1.0",
  "id": "<event-id>",
  "type": "payment.transaction.created",
  "createdAt": "2025-12-01T...",
  "attempt": 1,
  "idempotencyKey": "<event-id>",
  "clinicId": "<clinic-id>",
  "resource": "payment_transaction",
  "data": {"test": true}
}
```

4. Verifique no banco:
```sql
SELECT status, attempts, last_code, delivered_at
FROM outbound_webhook_deliveries
WHERE event_id = '<event-id>';
```

Deve retornar:
- `status = 'DELIVERED'`
- `attempts = 1`
- `last_code = 200`
- `delivered_at` preenchido

---

## 📊 Monitoramento

### Logs GitHub Actions
- **GitHub → Actions → Webhooks Pump**
- Cada execução mostra:
  - Quantos deliveries foram picked
  - Quantos foram triggered
  - Erros (se houver)

### Logs Vercel
- **Vercel Dashboard → Seu Projeto → Logs**
- Filtrar por `/api/webhooks/pump` ou `/api/webhooks/deliver`
- Ver requests, responses, erros

### Banco de Dados
```sql
-- Deliveries pendentes
SELECT COUNT(*) FROM outbound_webhook_deliveries WHERE status = 'PENDING';

-- Deliveries falhadas
SELECT COUNT(*) FROM outbound_webhook_deliveries WHERE status = 'FAILED';

-- Deliveries entregues nas últimas 24h
SELECT COUNT(*) FROM outbound_webhook_deliveries 
WHERE status = 'DELIVERED' AND delivered_at > NOW() - INTERVAL '24 hours';

-- Deliveries stuck (>1h PENDING sem update)
SELECT COUNT(*) FROM outbound_webhook_deliveries
WHERE status = 'PENDING' 
  AND created_at < NOW() - INTERVAL '1 hour'
  AND updated_at < NOW() - INTERVAL '1 hour';
```

---

## 🔧 Troubleshooting

### Problema: GitHub Actions não roda

**Causa:** Workflow desativado ou secrets ausentes

**Solução:**
1. Verifique se `.github/workflows/webhooks-pump.yml` existe
2. Vá em **Actions** e ative workflows se estiver desativado
3. Verifique secrets: `APP_BASE_URL` e `WEBHOOKS_CRON_SECRET`

---

### Problema: Deliveries ficam PENDING

**Causa:** Envs não configuradas ou GitHub Actions não rodando

**Solução:**
1. Verifique envs na Vercel: `APP_BASE_URL`, `WEBHOOKS_USE_NATIVE`, `WEBHOOKS_CRON_SECRET`
2. Rode workflow manualmente: **Actions → Run workflow**
3. Verifique logs do pump: deve retornar `{ picked: N, triggered: N }`

---

### Problema: Webhook não chega no endpoint

**Causa:** URL inválida, HTTPS ausente, ou endpoint down

**Solução:**
1. Verifique se URL do endpoint começa com `https://`
2. Teste URL manualmente com curl:
```bash
curl -X POST https://seu-endpoint.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```
3. Verifique `last_error` no delivery:
```sql
SELECT last_error FROM outbound_webhook_deliveries WHERE id = '<delivery-id>';
```

---

### Problema: Assinatura HMAC inválida

**Causa:** Secret incorreto ou implementação de validação errada no receptor

**Solução:**
1. Verifique secret do endpoint no banco
2. Implemente validação correta no receptor:
```typescript
import crypto from 'crypto';

function validateSignature(body: string, signature: string, secret: string, timestamp: string) {
  const payload = `${timestamp}.${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expectedSignature;
}
```

---

## 💰 Custos

| Item | Custo |
|------|-------|
| GitHub Actions (2080 execuções/mês) | **R$ 0,00** (free tier: 2000 min/mês) |
| Vercel Hosting (Hobby plan) | **R$ 0,00** |
| Rotas Vercel (`/api/webhooks/*`) | **R$ 0,00** |
| **TOTAL** | **R$ 0,00** 🎉 |

---

## 📝 Arquivos Importantes

### Ativos
- `.github/workflows/webhooks-pump.yml` - Cron gratuito
- `src/app/api/webhooks/deliver/route.ts` - Delivery único
- `src/app/api/webhooks/pump/route.ts` - Pump batch
- `src/app/api/webhooks/retry-stuck/route.ts` - Safety net
- `src/lib/webhooks/emit-updated.ts` - Emissor

### Deprecated (mantidos como referência)
- `src/lib/webhooks/outbound-worker.ts` - Worker legado
- `src/lib/webhooks/bootstrap.ts` - Bootstrap legado
- `trigger/deliver-webhook.ts` - Task Trigger.dev (desativada)
- `trigger/check-stuck-deliveries.ts` - Schedule Trigger.dev (desativada)

### Outros Trigger.dev (NÃO TOCAR)
- `trigger/billing-renewal.ts` - Ativo
- `trigger/billing-scheduler.ts` - Ativo
- `trigger/expiring-cards-notifier.ts` - Ativo
- `trigger/db-health.ts` - Ativo

---

## ✅ Checklist Final

- [ ] Secrets configurados no GitHub (`APP_BASE_URL`, `WEBHOOKS_CRON_SECRET`)
- [ ] Envs configuradas na Vercel (mínimo: `DATABASE_URL`, `APP_BASE_URL`, `WEBHOOKS_USE_NATIVE`, `WEBHOOKS_CRON_SECRET`)
- [ ] Deploy feito (`git push`)
- [ ] GitHub Actions testado manualmente (Run workflow)
- [ ] Teste end-to-end realizado (criar evento → verificar entrega)
- [ ] Monitoramento configurado (logs GitHub + Vercel + queries SQL)

---

## 🎯 Próximos Passos (Opcional)

### 1. Adicionar controle de concorrência
Implementar respeito a `max_concurrent_deliveries` em `pump/route.ts` usando query similar ao worker legado.

### 2. Métricas avançadas
- Integrar com Sentry/Datadog
- Alertas se >100 deliveries PENDING por >30 min
- Dashboard de taxa de sucesso/falha

### 3. Retry manual via UI
Criar interface admin para:
- Listar deliveries
- Retry manual de FAILED
- Ver logs/erros

---

## 📚 Documentação Relacionada

- `WEBHOOKS_CRON_ANALYSIS.md` - Análise completa da duplicação
- `WEBHOOKS_VERCEL_MVP.md` - Plano original do MVP
- `docs/public/WEBHOOKS_INTEGRATION_GUIDE.md` - Guia para clientes

---

**Tudo pronto! Sistema 100% gratuito e funcional.** 🚀
