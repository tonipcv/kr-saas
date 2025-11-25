# Trigger.dev (v4) – Guia Completo

Este documento cobre tudo que existe de Trigger.dev no projeto, como funciona, como testar localmente e em produção, variáveis de ambiente, problemas comuns e correções.

## Visão Geral

- **SDK**: `@trigger.dev/sdk` na versão `4.1.1` (ver `package.json`).
- **Configuração**: `trigger.config.ts` define projeto, runtime, retries, idempotência e limites.
- **Tarefas existentes** em `trigger/`:
  - `trigger/billing-renewal.ts` → `dailyBillingRenewal` (agendada diária 09:00 America/Sao_Paulo). Busca assinaturas DUE e dispara tasks específicas por provedor via `tasks.trigger()`.
  - `trigger/billing-scheduler.ts` → `billingScheduler` (DRY RUN a cada minuto). Faz contagem e lista o que seria renovado.
  - `trigger/expiring-cards-notifier.ts` → `expiringCardsNotifier` (segunda 10:00 America/Sao_Paulo). Planeja envio de emails para cartões a expirar (apenas logs).
  - `trigger/renewal-jobs/pagarme-prepaid.ts` → `pagarmePrepaidRenewal` (task on-demand).
  - `trigger/renewal-jobs/appmax.ts` → `appmaxRenewal` (task on-demand).

Todas usam Prisma (`@/lib/prisma`) e metadados nas entidades para decidir renovação/período.

## Como funciona (arquitetura)

- **Tarefas agendadas (`schedules.task`)**:
  - `dailyBillingRenewal` procura assinaturas DUE e dispara tasks por provedor usando `tasks.trigger("<task-id>", payload)`.
  - `billingScheduler` roda em modo observação (DRY RUN), a cada minuto, para visão rápida do estado.
  - `expiringCardsNotifier` lista cartões prestes a expirar e loga a intenção de notificação.
- **Tarefas sob demanda (`task`)**:
  - `pagarmePrepaidRenewal`: cria `order` no Pagar.me com cartão salvo (customer/card id) e atualiza `payment_transactions` + `customer_subscriptions`.
  - `appmaxRenewal`: cria `order` no Appmax, tenta cobrar via token salvo, registra `payment_transactions` e atualiza ciclo da assinatura.
- **Feature flags** controlam disparos e execução: `TRIGGER_ENABLE_PAGARME_PREPAID`, `TRIGGER_ENABLE_APPMAX`.
- **Persistência**: usa tabelas `customerSubscription`, `customerPaymentMethod`, `paymentTransaction`, `event` (todos via Prisma). IDs determinísticos são usados para prevenir duplicidade em transações de renovação (e.g. `tx_appmax_<subscriptionId>_<YYYYMM>`).
- **Períodos**: calculados a partir de `currentPeriodEnd` + `metadata.intervalUnit/intervalCount`.

## Arquivos principais

- `trigger.config.ts`
```ts
export default {
  project: process.env.TRIGGER_PROJECT || "proj_naaseftufwbqfmmzzdth",
  runtime: "node",
  logLevel: "info",
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2 },
  },
  enableIdempotency: true,
  concurrencyLimit: 50,
  maxDuration: 60, // v4 exige >= 5s
} as any;
```
- `trigger/billing-renewal.ts`: dispara `pagarme-prepaid-renewal` e/ou `appmax-renewal` conforme flags.
- `trigger/billing-scheduler.ts`: DRY RUN a cada minuto.
- `trigger/expiring-cards-notifier.ts`: notificação de cartão expirando (logs, sem envio real).
- `trigger/renewal-jobs/pagarme-prepaid.ts`: renovação Pagar.me pre-pago.
- `trigger/renewal-jobs/appmax.ts`: renovação Appmax.

## Variáveis de ambiente (mínimas)

- **Trigger.dev**
  - `TRIGGER_PROJECT`: ID do projeto Trigger.dev (ex.: `proj_xxx`). Default presente no repo.
  - `TRIGGER_API_KEY`: chave de API do Trigger.dev (necessária para CLI/dev/deploy).
- **Feature flags**
  - `TRIGGER_ENABLE_PAGARME_PREPAID`: `true` para habilitar Pagar.me Prepaid.
  - `TRIGGER_ENABLE_APPMAX`: `true` para habilitar Appmax.
- **App**
  - `NEXT_PUBLIC_APP_URL`: usado no `expiring-cards-notifier` para montar link `/billing/cards`.
- **Banco de dados**
  - Todas as variáveis do Prisma/DB usuais (ver `.env` do projeto). As tasks consultam e atualizam via Prisma.
- **Provedores**
  - Pagar.me: os métodos `pagarmeCreateOrder` devem ler suas próprias credenciais.
  - Appmax: `buildAppmaxClientForMerchant(merchantId)` deve resolver credenciais por merchant.

## Pré-requisitos

- Node 18+.
- Banco de dados acessível e migrado.
- `npm i` para instalar dependências (inclui `@trigger.dev/sdk`).
- CLI Trigger.dev (use via npx): `npx @trigger.dev/cli@latest`.

## Rodando localmente (DEV)

1. Configure `.env` com as variáveis acima. Garanta que `TRIGGER_API_KEY` aponta para ambiente DEV do Trigger.dev.
2. Inicie sua aplicação se for necessário (Next não é estritamente necessário para tasks, mas DB e libs sim).
3. Inicie o Trigger.dev DEV CLI no root do projeto:
```bash
npx @trigger.dev/cli dev
```
- O CLI fará o discovery das tasks em `trigger/` e registrará no projeto `TRIGGER_PROJECT`.
- Em DEV, crons só disparam enquanto o CLI estiver ativo.

4. Verifique no dashboard do Trigger.dev se as tasks aparecem (ids):
   - `daily-billing-renewal`
   - `billing-scheduler-dry-run`
   - `expiring-cards-notifier`
   - `pagarme-prepaid-renewal`
   - `appmax-renewal`

## Como testar

- **Testar DRY RUN (scheduler a cada minuto)**
  - Garanta que o CLI está rodando.
  - Ver os logs da task `billing-scheduler-dry-run` no dashboard ou console do CLI a cada minuto.
  - Confirme contagens e listagem de assinaturas DUE.

- **Forçar execução do `daily-billing-renewal`**
  - Pelo dashboard: Task → `daily-billing-renewal` → Test → Run now (override do cron).
  - Checar logs de disparo `tasks.trigger()` e se as tasks-filhas foram enfileiradas.

- **Testar `pagarme-prepaid-renewal` (unitária)**
  - Defina `TRIGGER_ENABLE_PAGARME_PREPAID=true`.
  - Pelo dashboard: Task → `pagarme-prepaid-renewal` → Test → Payload `{ "subscriptionId": "<id>" }`.
  - Pré-condições de dados:
    - `customer_subscriptions`: `provider = PAGARME`, `isNative = false`, `currentPeriodEnd <= now`.
    - `metadata` deve conter `pagarmeCustomerId` e, se necessário, `pagarmeCardId` (ou `customer_payment_methods.providerPaymentMethodId`).
  - Resultado esperado: criação de `order` no Pagar.me, upsert em `payment_transactions`, possível avanço do período na assinatura se `paid`.

- **Testar `appmax-renewal` (unitária)**
  - Defina `TRIGGER_ENABLE_APPMAX=true`.
  - Pelo dashboard: Task → `appmax-renewal` → Test → Payload `{ "subscriptionId": "<id>" }`.
  - Pré-condições de dados:
    - `customer_subscriptions`: `provider = APPMAX`, `currentPeriodEnd <= now`.
    - `metadata.appmaxCustomerId` presente.
    - `customer_payment_methods` com `provider = APPMAX`, `status = ACTIVE`, e `providerPaymentMethodId` (token do cartão salvo).
  - Resultado esperado: `order` e tentativa de pagamento; upsert em `payment_transactions`; atualização do ciclo se sucesso.

- **Testar `expiring-cards-notifier`**
  - Pelo dashboard: Run now.
  - Ver logs de cartões alvo e links gerados. Não há envio real de email no repo.

- **Testar via código** (opcional)
  - De qualquer backend do projeto, é possível fazer:
```ts
import { tasks } from "@trigger.dev/sdk";
await tasks.trigger("pagarme-prepaid-renewal", { subscriptionId: "..." });
```
  - Em tasks, use `childTask.trigger()`/`triggerAndWait()` conforme necessidade.

## Problemas comuns e como resolver

- **SDK v4 com imports `/v3`**
  - Os arquivos importam de `@trigger.dev/sdk/v3` (ex.: `billing-renewal.ts`). O pacote instalado é `4.1.1`.
  - A v4 mantém compat de namespace em muitos casos, mas a recomendação é migrar para `@trigger.dev/sdk` puro para evitar quebras futuras.
  - Ação sugerida: atualizar imports para `@trigger.dev/sdk` e ajustar chamadas conforme docs v4. Testar no DEV CLI.

- **Crons não disparam em DEV**
  - Garanta que o CLI está rodando: `npx @trigger.dev/cli dev`.
  - Verifique `TRIGGER_API_KEY` e `TRIGGER_PROJECT` corretos para o workspace.

- **Tasks não aparecem no dashboard**
  - Tasks precisam ser importadas/avaliadas em algum arquivo carregado pelo processo do CLI. Como estão em `trigger/` com `export const ... = ...`, o CLI descobre por varredura.
  - Se necessário, crie um barrel `trigger/index.ts` importando todos os arquivos para garantir avaliação estática.

- **Erros de Prisma/DB**
  - Verifique conexão e migrações. Tasks consultam/atualizam `customerSubscription`, `customerPaymentMethod`, `paymentTransaction`, `event`.
  - IDs duplicados em `paymentTransaction`: esperado que o upsert use ID determinístico (Pagar.me usa `tx_pagarme_<orderId>`, Appmax usa `tx_appmax_<subscriptionId>_<YYYYMM>`). Se colidir indevidamente, revisar estratégia de ID.

- **Faltam metadados de provedores**
  - Pagar.me: requer `pagarmeCustomerId` e cartão (`paymentMethod.providerPaymentMethodId` ou `metadata.pagarmeCardId`).
  - Appmax: requer `metadata.appmaxCustomerId` e `customer_payment_methods.providerPaymentMethodId` (token salvo).
  - Sem isso, tasks retornam `skipped` ou marcam assinatura `PAST_DUE` conforme fluxo.

- **Feature flags desligadas**
  - `dailyBillingRenewal` só dispara providers com flags ligadas.
  - Ligue `TRIGGER_ENABLE_PAGARME_PREPAID`/`TRIGGER_ENABLE_APPMAX` para testes.

- **Timezones e horários**
  - `dailyBillingRenewal`: 09:00 `America/Sao_Paulo`.
  - `expiringCardsNotifier`: segunda 10:00 `America/Sao_Paulo`.
  - Em DEV, use o botão "Run now" no dashboard para não depender do horário.

- **Limites e duração**
  - `trigger.config.ts`: `concurrencyLimit: 50`, `maxDuration: 60` (segundos). Ajuste se necessário.
  - Tasks específicas têm `queue.concurrencyLimit: 10` e políticas de retry customizadas.

- **Não há envio real de e-mail**
  - `expiring-cards-notifier` apenas loga. Para produção, integrar com um mailer e substituir logs por calls de envio.

## Boas práticas e recomendações

- **Centralizar imports no v4**: usar `import { task, schedules, tasks, wait } from "@trigger.dev/sdk"` (sem `/v3`).
- **Schema validation**: para payloads, considere `schemaTask` com Zod.
- **`triggerAndWait`**: sempre tratar o `Result` (`ok`, `error`, `output`) antes de usar output.
- **Idempotência**: manter IDs determinísticos nas transações por ciclo de faturamento.
- **Observabilidade**: manter logs claros (já existe padrão com prefixos `[SCHEDULER]`, `[NOTIFIER]`).
- **Segurança**: nunca logar dados sensíveis de cartão; os logs atuais não expõem PAN, apenas `last4`.

## Deploy/Produção

- Faça o deploy da aplicação normalmente.
- Execute `npx @trigger.dev/cli deploy` no ambiente de CI/CD ou local apontando para o projeto certo, para promover a versão e sincronizar schedules declarativos.
- Garanta que variáveis `TRIGGER_PROJECT` e `TRIGGER_API_KEY` (produção) estejam corretas.
- Crons só rodam na "latest deployment" do ambiente corrente no Trigger.dev.

## Checklist rápido de teste

- **[config]** `TRIGGER_API_KEY`, `TRIGGER_PROJECT`, DB ok.
- **[cli]** `npx @trigger.dev/cli dev` rodando.
- **[flags]** Ativar `TRIGGER_ENABLE_*` conforme provedor.
- **[dados]** Assinatura DUE (provider correto, `currentPeriodEnd <= now`).
- **[exec]** Rodar `billing-scheduler-dry-run` e ver contagens.
- **[exec]** Rodar `daily-billing-renewal` e checar disparos.
- **[exec]** Rodar tasks unitárias por provedor com payload de teste.
- **[db]** Conferir `payment_transactions` e atualização de `customer_subscriptions`.

## Anexos (IDs das tasks)

- `daily-billing-renewal`
- `billing-scheduler-dry-run`
- `expiring-cards-notifier`
- `pagarme-prepaid-renewal`
- `appmax-renewal`

---

Dúvidas ou melhorias desejadas: migrar todos os imports para `@trigger.dev/sdk` (v4), adicionar validação de schema nos payloads e integrar envio de email real no `expiring-cards-notifier`.
