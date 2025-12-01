# Guia de Teste End‑to‑End: Webhooks (htps.io → Vercel Routes)

Este guia ensina, passo a passo, a testar os webhooks outbound usando um receptor HTTP público do htps.io, criando todos os dados necessários (clínica, endpoint, evento e delivery) e processando via rotas nativas + GitHub Actions.

## Pré‑requisitos

- **Env Vercel**: `APP_BASE_URL`, `WEBHOOKS_USE_NATIVE=true`, `WEBHOOKS_CRON_SECRET`, `DATABASE_URL`.
- **GitHub Actions secrets**: `APP_BASE_URL`, `WEBHOOKS_CRON_SECRET`.
- **Rotas já existem**:
  - `POST /api/webhooks/deliver`
  - `POST /api/webhooks/pump`
  - `POST /api/webhooks/retry-stuck`
- **Arquivos úteis**:
  - `src/lib/webhooks/emit-updated.ts` (emissor nativo)

---

## 1) Criar receptor no htps.io (URL HTTPS)

1. Acesse: https://htps.io
2. Crie um endpoint de teste (gera uma URL HTTPS pública).
3. Copie a URL, por exemplo: `https://htps.io/api/webhook/<seu-id>`

Você verá as requisições chegando em tempo real.

---

## 2) Criar dados base no banco (SQL Postgres)

Use um cliente SQL (psql, DBeaver, Prisma Studio) apontando para o `DATABASE_URL`.

### 2.1 Criar uma clínica de teste

Se já tiver `clinics`, reutilize uma. Caso contrário:
```sql
INSERT INTO clinics (id, name, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'Clinica E2E', NOW())
ON CONFLICT (id) DO NOTHING;
```

Anote o `clinic_id` usado: `00000000-0000-0000-0000-000000000001`

### 2.2 Criar um endpoint de webhook

- Use a URL do htps.io no campo `url` (precisa ser HTTPS).
- Defina um secret de teste.
- Inclua o evento que quer testar, por exemplo `payment.transaction.created`.

```sql
INSERT INTO webhook_endpoints (
  id, clinic_id, name, url, secret, enabled, events, max_concurrent_deliveries,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'Endpoint E2E (htps.io)',
  'https://htps.io/api/webhook/<seu-id>',
  'test-secret-123',
  true,
  ARRAY['payment.transaction.created'],
  5,
  NOW(), NOW()
) RETURNING id;
```

Guarde o `endpoint_id` retornado.

### 2.3 Criar um evento outbound

```sql
INSERT INTO outbound_webhook_events (
  id, clinic_id, type, resource, resource_id, payload, created_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'payment.transaction.created',
  'payment_transaction',
  'tx-e2e-123',
  '{"test": true}'::jsonb,
  NOW()
) RETURNING id;
```

Guarde o `event_id` retornado.

### 2.4 Criar a delivery PENDING

Crie a delivery linkando `endpoint_id` + `event_id` e marcando como `PENDING` para processamento.

```sql
INSERT INTO outbound_webhook_deliveries (
  id, endpoint_id, event_id, status, attempts, last_code, last_error,
  next_attempt_at, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '<endpoint_id>',
  '<event_id>',
  'PENDING',
  0,
  NULL,
  NULL,
  NOW(),
  NOW(), NOW()
) RETURNING id;
```

Guarde o `delivery_id` retornado.

---

## 3) Processar via rotas (manual)

### 3.1 Entregar uma única delivery

```bash
curl -X POST "$APP_BASE_URL/api/webhooks/deliver" \
  -H "Content-Type: application/json" \
  -d '{"deliveryId":"<delivery_id>"}'
```

Resposta esperada:
- 200 `{"status":"delivered", ...}` se o endpoint respondeu 2xx
- 202 `{"status":"pending", ...}` se haverá retry/backoff

### 3.2 Rodar o pump (cron manual)

```bash
curl -X POST "$APP_BASE_URL/api/webhooks/pump" \
  -H "x-cron-secret: $WEBHOOKS_CRON_SECRET"
```

Resposta:
- `{"picked": N, "triggered": M}`

### 3.3 Rodar o retry-stuck

```bash
curl -X POST "$APP_BASE_URL/api/webhooks/retry-stuck" \
  -H "x-cron-secret: $WEBHOOKS_CRON_SECRET"
```

Resposta:
- `{"failed": X, "rescheduled": Y}`

---

## 4) Processar via GitHub Actions (gratuito)

O workflow `.github/workflows/webhooks-pump.yml` roda a cada 5 min e também pode ser executado manualmente:

1. GitHub → Actions → "Webhooks Pump"
2. Clique em "Run workflow" → "Run workflow"
3. Aguarde ~30s e veja os logs das etapas "Pump webhooks" e "Retry stuck"

---

## 5) Verificar recebimento no htps.io

Abra o painel do htps.io e confira a requisição recebida:
- **Headers**:
  - `X-Webhook-Id`
  - `X-Webhook-Event`
  - `X-Webhook-Signature`
  - `X-Webhook-Timestamp`
  - `X-Webhook-Spec-Version`
- **Body (exemplo)**:
```json
{
  "specVersion": "1.0",
  "id": "<event_id>",
  "type": "payment.transaction.created",
  "createdAt": "2025-12-01T...",
  "attempt": 1,
  "idempotencyKey": "<event_id>",
  "clinicId": "00000000-0000-0000-0000-000000000001",
  "resource": "payment_transaction",
  "data": { "test": true }
}
```

---

## 6) Conferir estado no banco

Consultas úteis:
```sql
-- Delivery criada
SELECT id, status, attempts, last_code, last_error, delivered_at, next_attempt_at
FROM outbound_webhook_deliveries
WHERE id = '<delivery_id>';

-- Por evento
SELECT id, status, attempts, last_code, last_error, delivered_at
FROM outbound_webhook_deliveries
WHERE event_id = '<event_id>'
ORDER BY created_at DESC;

-- Pendentes
SELECT COUNT(*) FROM outbound_webhook_deliveries WHERE status = 'PENDING';

-- Falhadas
SELECT COUNT(*) FROM outbound_webhook_deliveries WHERE status = 'FAILED';

-- Entregues últimas 24h
SELECT COUNT(*) FROM outbound_webhook_deliveries
WHERE status = 'DELIVERED' AND delivered_at > NOW() - INTERVAL '24 hours';
```

Esperado após sucesso:
- `status = 'DELIVERED'`
- `attempts >= 1`
- `last_code = 200`
- `delivered_at` preenchido
- `next_attempt_at = NULL`

---

## 7) Teste usando o emissor nativo (sem SQL)

Se preferir não escrever SQL, acione os helpers que já usam `emitOutboundEvent()` internamente em `src/lib/webhooks/emit-updated.ts`:

- `onPaymentTransactionCreated(transactionId)`
- `onPaymentTransactionStatusChanged(transactionId, newStatus)`

Fluxo:
1. Garanta `WEBHOOKS_USE_NATIVE=true` e `APP_BASE_URL` configurado.
2. Crie uma `payment_transaction` real e obtenha `transactionId`.
3. Chame um dos helpers acima (por uma rota interna, script TS ou ação da aplicação).
4. Isso criará o `outbound_webhook_event` + deliveries automaticamente.
5. O emissor tentará um `POST /api/webhooks/deliver` de forma best‑effort; o cron (pump) cobre o restante.

---

## 8) Problemas comuns

- **401 no pump/retry-stuck**: Header `x-cron-secret` ausente/incorreto. Use o mesmo valor configurado na Vercel e no GitHub.
- **URL sem HTTPS**: Deliveries falham com `Endpoint URL must use HTTPS`. O htps.io fornece HTTPS.
- **Assinatura inválida no receptor**: Confirme `secret` configurado no endpoint e a validação HMAC do receptor.
- **Nenhuma delivery processada**: Verifique se existem `PENDING` com `next_attempt_at <= NOW()`.
- **Deploy não reflete**: Verifique integração do repo com Vercel e envs em Production.

---

## 9) Checklist rápido

- [ ] URL do htps.io criada e copiada
- [ ] Clínica criada ou reutilizada
- [ ] Endpoint inserido (HTTPS, secret, eventos)
- [ ] Evento criado (tipo + payload)
- [ ] Delivery PENDING criada
- [ ] Pump manual ou GitHub Actions executado
- [ ] Recebimento no htps.io confirmado
- [ ] Delivery marcada como `DELIVERED` no banco

---

Pronto! Seu teste end‑to‑end de webhooks está validado usando htps.io + rotas Vercel + GitHub Actions (100% gratuito).
