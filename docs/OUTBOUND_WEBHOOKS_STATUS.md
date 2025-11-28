# Outbound Webhooks – Status de Implementação

Data: 2025-11-27

## Visão Geral
- **Objetivo**: Habilitar webhooks outbound (notificações para endpoints externos) sem impactar o pipeline inbound existente.
- **Estado**: Fundações criadas (modelos Prisma, migração segura por Node.js, serviços core de emissão/payload/assinatura, worker SQL-driven com backoff). Feature desativada por padrão via ENV flag.

---

## Itens Criados

- **[Prisma – Modelos (OUTBOUND) e Relações]** `prisma/schema.prisma`
  - `WebhookEndpoint` → `@@map("webhook_endpoints")`
  - `OutboundWebhookEvent` → `@@map("outbound_webhook_events")`
  - `OutboundWebhookDelivery` → `@@map("outbound_webhook_deliveries")`
  - `Clinic` com relações: `webhookEndpoints`, `outboundEvents`

- **[Migração Segura (Node.js)]** `scripts/migrations/add_outbound_webhooks.js`
  - Cria tabelas, FKs, índices e CHECK constraints (HTTPS em `url`, prefixo `whsec_` para `secret`)
  - Idempotente, transacional, executa statements individualmente
  - Execução concluída com sucesso: `node scripts/migrations/add_outbound_webhooks.js`

- **[Assinatura HMAC]** `src/lib/webhooks/signature.ts`
  - `signPayload(secret, body, timestamp)`
  - `verifySignature(secret, body, signature, toleranceSeconds)`
  - `generateSecret()`

- **[Builder de Payload]** `src/lib/webhooks/payload.ts`
  - `buildTransactionPayload(transactionId)`
  - Snapshot seguro de `PaymentTransaction` com possíveis `checkout`, `product`, `offer`

- **[Emissão de Eventos]** `src/lib/webhooks/emit-updated.ts`
  - `emitOutboundEvent({ clinicId, type, resource, resourceId, payload })`
  - Helpers:
    - `onPaymentTransactionCreated(transactionId)`
    - `onPaymentTransactionStatusChanged(transactionId, newStatus)`
    - `onPaymentTransactionPartiallyRefunded(transactionId)`

- **[Worker SQL-driven]** `src/lib/webhooks/outbound-worker.ts`
  - Poll de deliveries `PENDING` com `FOR UPDATE SKIP LOCKED`
  - Backoff: `[0,60,300,900,3600,21600,86400,...]`
  - POST com headers, assinatura HMAC, update de status/código/erro/`nextAttemptAt`

- **[Bootstrap com ENV flag]** `src/lib/webhooks/bootstrap.ts`
  - `bootstrapOutboundWebhooksWorker()` inicia worker somente se `OUTBOUND_WEBHOOKS_ENABLED=true`

---

## O que Falta (Backlog)

- **[Wiring do Bootstrap]**
  - Onde chamar `bootstrapOutboundWebhooksWorker()` no servidor (ponto de inicialização server-only). Ex.: arquivo central `src/lib/server.ts` ou similar.

- **[APIs REST (Admin)]** `src/app/api/webhooks/`
  - `endpoints/route.ts` (GET/POST)
  - `endpoints/[id]/route.ts` (GET/PATCH/DELETE)
  - `endpoints/[id]/rotate-secret/route.ts` (POST)
  - `deliveries/route.ts` (GET com paginação e filtros)
  - `deliveries/[id]/retry/route.ts` (POST)
  - `test/route.ts` (POST para envio de teste)
  - Adicionar autenticação/autorização: `getServerSession`, `checkClinicAccess(userId, clinicId)`

- **[Integração com Fluxos]**
  - Emissões nos pontos:
    - `src/app/api/payments/pagarme/webhook/route.ts`
    - `src/app/api/stripe/webhook/route.ts`
    - Criação de `PaymentTransaction`
    - Reembolsos
  - Envolver emissões e start do worker sob ENV flag para rollout seguro

- **[UI (Admin)]** `src/app/(authenticated)/business/integrations/webhooks/page.tsx`
  - Lista/CRUD de endpoints
  - Envio de teste
  - Histórico de entregas + detalhes + retry
  - Padrões visuais: reaproveitar `.../business/payments/webhooks/page.tsx`

- **[Testes]**
  - Unitários: assinatura HMAC, payload builder, emissão, worker (backoff/erros)
  - Integração: fluxo end-to-end (criar endpoint → emitir evento → entregar → status)

- **[Observabilidade & Segurança]**
  - Métricas por endpoint, dashboards e alertas
  - Rate limiting nas rotas e/ou por endpoint
  - RBAC (OWNER/MANAGER) e audit logs de alterações

- **[Higiene de Configuração (Baixa Prioridade)]**
  - Prisma 6 warning: mover `datasource.url` para `prisma.config.ts` (não alterado para não impactar nada atual)

---

## Como Habilitar (Somente quando pronto)

- **ENV flag**
```bash
export OUTBOUND_WEBHOOKS_ENABLED=true
```
- **Bootstrap** (chamar uma vez no server init)
```ts
import { bootstrapOutboundWebhooksWorker } from '@/lib/webhooks/bootstrap'
bootstrapOutboundWebhooksWorker()
```
- **Emissões** (exemplos)
```ts
import { onPaymentTransactionStatusChanged } from '@/lib/webhooks/emit-updated'
await onPaymentTransactionStatusChanged(transactionId, newStatus)
```

---

## Garantias de Não Quebra
- Tabelas OUTBOUND separadas das INBOUND (`webhook_events` permanece intocada).
- Novos módulos ficam inertes até serem explicitamente usados.
- Worker inicia somente com `OUTBOUND_WEBHOOKS_ENABLED=true`.
- Migração por Node.js é idempotente e não destrutiva.

---

## Próximos Passos Sugeridos
- Definir ponto de bootstrap server-only e habilitar em ambiente de staging com `OUTBOUND_WEBHOOKS_ENABLED=true`.
- Implementar rotas REST (CRUD/rotate/test/deliveries/retry) com autenticação.
- Adicionar emissões em Pagarme/Stripe/Criação/Refunds atrás de uma feature flag.
- Construir a UI de administração.
- Testes E2E e observabilidade antes do rollout em produção.
