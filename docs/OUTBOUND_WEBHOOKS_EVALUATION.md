# Webhooks de Payment Transactions – Avaliação do Guia (Base: repo atual)

Versão do guia avaliado: 1.0 (2025-11-27)

## Sumário Executivo
- **Aderência geral**: Parcial. O repo possui fundação robusta para webhooks inbound (providers), persistência de eventos e um worker customizado, mas não contempla webhooks outbound.
- **Principais lacunas**: Modelos `WebhookEndpoint`/`WebhookDelivery` (outbound) ausentes, serviço de emissão (`emitWebhookEvent`) indisponível, assinatura HMAC, endpoints de administração, e UI específica para endpoints/entregas outbound.
- **Alinhamentos fortes**: 
  - Modelagem de `PaymentTransaction` consistente para enriquecer payloads (`prisma/schema.prisma` → `PaymentTransaction`).
  - Infra de processamento e reprocesso de eventos inbound com backoff existente (`lib/queue/pgboss.ts` e tabela `webhook_events`).
  - Página administrativa de eventos (inbound) que pode inspirar a UI outbound (`src/app/(authenticated)/business/payments/webhooks/page.tsx`).

---

## Achados

- **Modelagem atual (Prisma)**
  - Existe `model WebhookEvent` mapeado para eventos INBOUND de provedores (`prisma/schema.prisma:1415-1448`). Campos: `provider`, `hook_id`, `raw`, `processed`, `retry_count`, etc. Não é o mesmo que o proposto para outbound.
  - Não há `WebhookEndpoint`, `WebhookDelivery` conforme o guia. Também não há relação em `Clinic` para endpoints/outbound events.
  - `PaymentTransaction` já contém campos necessários para construir snapshots no payload outbound: `provider`, `providerOrderId`, `providerChargeId`, `clinicId`, `merchantId`, `amountCents`, `currency`, `installments`, `paymentMethodType`, `status`, `status_v2`, períodos de billing, IDs de customer/subscription, links com `CheckoutSession` (`prisma/schema.prisma:903-958`).

- **Fila/Worker**
  - Há um worker custom (`lib/queue/pgboss.ts`) que processa a tabela `webhook_events` (INBOUND), com polling, backoff, e normalização de Stripe/Krxpay.
  - Não há `pgboss` como cliente de fila com topologias de jobs nomeados para ENTREGAS outbound (p.ex., `webhook.deliver`). O arquivo `lib/queue/pgboss.ts` reaproveita Prisma para fazer locking e reprocesso em SQL.

- **Rotas de Webhook (INBOUND)**
  - `src/app/api/payments/pagarme/webhook/route.ts` e `src/app/api/stripe/webhook/route.ts` existem, alimentando a tabela `webhook_events` e atualizando `payment_transactions` via o worker.

- **UI atual**
  - `src/app/(authenticated)/business/payments/webhooks/page.tsx` lista e filtra eventos INBOUND (tabela `webhook_events`). Útil como referência para a futura UI outbound, porém não cobre endpoints/entregas outbound.

- **Docs existentes relacionadas**
  - `docs/WEBHOOK_RETRY_SYSTEM.md`, `PAYMENT_ORCHESTRATION_ANALYSIS.md` e outras análises de pagamentos indicam maturidade para lidar com reprocesso e normalização inbound, o que ajuda a implantar o outbound.

---

## Gap Analysis vs Guia Proposto

- **Modelos (Prisma)**
  - [Falta] `WebhookEndpoint`, `WebhookEvent` (outbound), `WebhookDelivery` com índices e relações a `Clinic`. O `WebhookEvent` existente é inbound e conflita no nome. Sugestões:
    - Renomear o modelo atual inbound para `ProviderWebhookEvent` (ou manter como está e criar `OutboundWebhookEvent` separado) para evitar colisão de `@@map("webhook_events")`.
    - Usar `@@map("webhook_endpoints")`, `@@map("webhook_deliveries")`, `@@map("webhook_events_out")` para distinguir fisicamente as tabelas outbound.

- **Segurança**
  - [Falta] Assinatura HMAC-SHA256 do payload outbound e verificação associada. Não há `lib/webhooks/signature.ts`.

- **Fila de Entregas**
  - [Falta] Job worker dedicado a entregas outbound com backoff configurável e startAfter (p.ex., `pgboss.send('webhook.deliver', ...)`).
  - Observação: o repo já possui lógica de backoff para inbound (SQL-driven). É possível replicar a estratégia para outbound usando o mesmo padrão ou introduzir pgboss de fato.

- **Serviços de Emissão**
  - [Falta] `emitWebhookEvent()` que persiste evento outbound, resolve endpoints habilitados por `clinicId` e `events`, cria deliveries e agenda jobs.

- **Endpoints de Administração (REST)**
  - [Falta] CRUD de endpoints (`/api/webhooks/endpoints`), rotação de secret, listagem de deliveries, retry manual, envio de teste.

- **UI**
  - [Falta] Página `src/app/(authenticated)/business/integrations/webhooks/page.tsx` com: gerenciamento de endpoints, envio de teste, histórico de entregas, detalhes, retry. Há somente a página de eventos inbound.

- **Payload e Privacidade**
  - [Parcial] `PaymentTransaction` e relações suportam compor o payload. [Falta] builder dedicado (`lib/webhooks/payload.ts`) com saneamento/máscara e opções configuráveis por endpoint.

---

## Riscos e Decisões de Design

- **Conflito de nomes/tabelas**: O modelo `WebhookEvent` já existe (inbound). Para outbound, use nomes/tabelas distintas para evitar migração disruptiva.
- **Backoff**: Manter o padrão de backoff do guia (1m/5m/15m/1h/6h/24h) é coerente. Pode ser implementado via coluna `nextAttemptAt` + re-enfileirar (com pgboss real) ou continuar com loop SQL (consistência com inbound).
- **Segurança**: Exigir HTTPS e HMAC. Implementar rotação de secrets e UI para exibição controlada do secret.
- **Observabilidade**: Reutilizar padrões de logs estruturados presentes no worker inbound; adicionar métricas por endpoint.

---

## Plano de Ação Recomendado (por fases)

- **Fase 1: Fundação**
  - Criar modelos Prisma OUTBOUND (novas tabelas, sem afetar as inbound): `WebhookEndpoint`, `OutboundWebhookEvent`, `WebhookDelivery` + relações em `Clinic`.
  - Migração: `npx prisma migrate dev --name add_outbound_webhooks` e `npx prisma generate`.
  - Implementar `lib/webhooks/signature.ts` (HMAC sign/verify, `generateSecret`).
  - Decidir: usar pgboss de verdade (cliente/worker) ou manter loop SQL. Recomendado pgboss para outbound.

- **Fase 2: Core**
  - `lib/webhooks/payload.ts` com builder de payload de transações (incluindo `checkout`, `product`, `offer` quando disponíveis), respeitando privacidade.
  - `lib/webhooks/emit.ts` implementando emissão, seleção de endpoints e criação de deliveries.
  - `lib/webhooks/worker.ts` para consumir jobs `webhook.deliver`, com retries e atualização de `WebhookDelivery`.
  - Testes unitários desses serviços.

- **Fase 3: API**
  - CRUD `/api/webhooks/endpoints` com validações (HTTPS, secret forte, eventos válidos).
  - Rotação de secret `/api/webhooks/endpoints/:id/rotate-secret`.
  - Listagem de deliveries `/api/webhooks/deliveries` (paginações e filtros).
  - Retry manual `/api/webhooks/deliveries/:id/retry`.
  - Envio de teste `/api/webhooks/test` com transação real ou payload custom.

- **Fase 4: Integração**
  - Injetar `emitWebhookEvent()` nos pontos do guia: criação de transação, handlers de webhook de provider, reembolsos.

- **Fase 5: UI**
  - Nova página `src/app/(authenticated)/business/integrations/webhooks/page.tsx` com: lista/CRUD de endpoints, teste, histórico de entregas, detalhes, retry.
  - Reaproveitar padrões visuais da página inbound existente `src/app/(authenticated)/business/payments/webhooks/page.tsx`.

- **Fase 6+: Observabilidade & Melhorias**
  - Métricas por endpoint, dashboards, alertas, exportações.

---

## Ajustes Sugeridos no Guia para este Repo

- **Nomenclatura de modelos**: Trocar `WebhookEvent` (outbound) para `OutboundWebhookEvent` no guia, evitando colisão com o `WebhookEvent` inbound existente. Ajustar `@@map` para tabelas distintas (`webhook_events_out`).
- **Fila**: O guia assume pgboss. Este repo usa um worker SQL-driven para inbound. Decidir e documentar se outbound usará pgboss (preferível) ou replicará o padrão SQL-driven por consistência.
- **UI de administração**: Integrar com o padrão de páginas Business existente. Rota sugerida no guia deve ser ajustada para o padrão do repo, por exemplo `src/app/(authenticated)/business/integrations/webhooks/page.tsx`.

---

## Trechos/Arquivos Relevantes
- `prisma/schema.prisma` → `PaymentTransaction`, `WebhookEvent` (inbound)
- `lib/queue/pgboss.ts` → worker inbound e backoff
- `src/app/api/payments/pagarme/webhook/route.ts` e `src/app/api/stripe/webhook/route.ts` → ingestão INBOUND
- `src/app/(authenticated)/business/payments/webhooks/page.tsx` → UI de eventos inbound

---

## Conclusão
- **Viabilidade**: Alta. A base de pagamentos e o ecossistema de eventos inbound existentes são um ótimo ponto de partida para o outbound.
- **Esforço**: Médio. Exige novas tabelas, um worker dedicado, camada de assinatura/segurança, e endpoints + UI de administração.
- **Próximos passos**: Executar Fase 1 (modelos + assinatura), decidir abordagem de fila, e alinhar nomenclaturas para coexistência com o pipeline inbound atual.
