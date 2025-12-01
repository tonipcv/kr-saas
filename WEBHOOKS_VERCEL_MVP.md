# Webhooks MVP (Vercel-Native)

Este documento resume a migração do fluxo de webhooks outbound do Trigger.dev para rotas nativas no Vercel (Next.js), o que já foi implementado e o que falta concluir.

## O que foi feito

- **[entrega single]** `src/app/api/webhooks/deliver/route.ts`
  - Recebe `POST { deliveryId }`.
  - Busca `outbound_webhook_deliveries` com `endpoint` e `event`.
  - Valida HTTPS, limita payload (1 MB), assina HMAC SHA-256 (`signPayload`), envia com timeout de 15s.
  - Atualiza delivery como `DELIVERED` ou `PENDING` com backoff (1m, 5m, 15m, 1h, 6h, 24h, 48h, 72h, 96h) e marca `FAILED` ao atingir 10 tentativas.

- **[pump/cron]** `src/app/api/webhooks/pump/route.ts`
  - Autorização por `x-vercel-cron` (Vercel Cron) ou `x-cron-secret` (manual).
  - Seleciona deliveries `PENDING` vencidas (`nextAttemptAt <= now` ou `null`), fan‐out para `/api/webhooks/deliver`.
  - Limite controlado por `WEBHOOKS_PUMP_LIMIT` (default 25).

## O que falta fazer

- **[vercel.json]** adicionar crons (minimamente o pump a cada minuto):
```json
{
  "crons": [
    { "path": "/api/webhooks/pump", "schedule": "*/1 * * * *" }
  ]
}
```

- **[switch do emissor]** atualizar `src/lib/webhooks/emit-updated.ts` para parar de chamar Trigger.dev:
  - Após criar `outboundWebhookDelivery`, se `WEBHOOKS_USE_NATIVE === "true"` e `APP_BASE_URL` setado, chamar `POST ${APP_BASE_URL}/api/webhooks/deliver` com `{ deliveryId }` (best-effort). O `pump` cobre quedas.

- **[envs]** configurar nas variáveis do Vercel:
  - `APP_BASE_URL=https://<seu-domínio>.vercel.app`
  - `WEBHOOKS_USE_NATIVE=true`
  - `WEBHOOKS_CRON_SECRET=<string-aleatoria>` (opcional; para chamadas manuais do `pump`)
  - `WEBHOOKS_PUMP_LIMIT=25` (opcional)
  - `DATABASE_URL` (já existente)

- **[opcional safety]** rota de safety similar a `check-stuck-deliveries` para marcar `FAILED` definitivo quando ultrapassar tentativas, ou reprogramar `nextAttemptAt` em casos travados.

- **[descomissionar Trigger.dev]** desativar chamadas e schedules referente a webhooks. Manter código até estabilizar, depois remover.

## Como testar

- **[entrega unitária]**
  - Criar `outbound_webhook_event` e `outbound_webhook_delivery` (com endpoint HTTPS válido).
  - `POST /api/webhooks/deliver` com `{ "deliveryId": "<id>" }`.
  - Checar colunas `status`, `attempts`, `lastCode`, `lastError`, `deliveredAt`, `nextAttemptAt`.

- **[pump]**
  - Setar `APP_BASE_URL`.
  - Local/manual: `POST /api/webhooks/pump` com header `x-cron-secret: <WEBHOOKS_CRON_SECRET>`.
  - Vercel Cron: conferir execuções no painel e logs.

## Notas técnicas

- A assinatura segue o formato atual via `@/lib/webhooks/signature`.
- O `User-Agent` é `KrxScale-Webhooks/1.0 (Vercel)`.
- As rotas são idempotentes por delivery; a persistência garante controle de fluxo.

## Arquivos relevantes

- `src/app/api/webhooks/deliver/route.ts`
- `src/app/api/webhooks/pump/route.ts`
- `src/lib/webhooks/emit-updated.ts` (ajustar switch para nativo)
- `vercel.json` (adicionar crons)

## Próximos passos

- **[1]** Adicionar `vercel.json` com o cron do `pump`.
- **[2]** Alterar `emit-updated.ts` para usar o fluxo nativo sob flag.
- **[3]** Configurar envs no Vercel (BASE_URL, cron secret, etc.).
- **[4]** Testes ponta a ponta e observabilidade de falhas/retries.
