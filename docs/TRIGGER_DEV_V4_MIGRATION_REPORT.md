# Trigger.dev — Relatório Completo de Migração e Testes

Data: 29/11/2025
Projeto: `proj_naaseftufwbqfmmzzdth`
Repositório: `tonipcv/kr-saas`
**Baseline escolhida: SDK v3 style (Option B)**

---

## 1) Visão Geral
- Objetivo: migrar o processamento de webhooks outbound para o Trigger.dev e descontinuar o worker manual.
- Resultado: tasks `deliver-webhook` e `check-stuck-deliveries` estão visíveis no dashboard. Build/Deploy OK.
- **Decisão arquitetural**: Padronizar TODOS os jobs no estilo dos renewals existentes (SDK v3, alias `@/lib/prisma`).
- Status atual: testes E2E funcionando via criação de delivery e execução da task. Falta garantir envs/DB em produção, se for rodar lá.

---

## 2) O que estava quebrando
- **Imports com alias `@/` dentro da pasta `trigger/`**: o bundler do Trigger.dev não resolve `tsconfig.paths`. Resultado: build falhava e as tasks não apareciam.
- **Confusão de imports do SDK**: v4 usa `@trigger.dev/sdk` para código de tasks, e `@trigger.dev/sdk/v3` apenas no `trigger.config.ts` (para `defineConfig`).
- **Script de teste exigia uma clínica existente**: sem `CLINIC_ID`, o teste abortava.

---

## 3) Baseline adotada (SDK v3 style)

### 3.1 Padrão unificado (todos os jobs)
- **Runtime imports**: `@trigger.dev/sdk/v3` para `task`, `schedules`, `tasks`
- **Prisma**: `import { prisma } from '@/lib/prisma'` (alias configurado no `tsconfig.json`)
- **Helpers**: usar aliases `@/lib/...` para funções auxiliares (ex.: `@/lib/webhooks/signature`)

### 3.2 Tasks
- `trigger/deliver-webhook.ts`
  - `import { task } from '@trigger.dev/sdk/v3'`
  - `import { prisma } from '@/lib/prisma'`
  - `import { signPayload } from '@/lib/webhooks/signature'`
  - Mantida a lógica de retries e atualizações no banco

- `trigger/check-stuck-deliveries.ts`
  - `import { schedules, tasks } from '@trigger.dev/sdk/v3'`
  - `import { prisma } from '@/lib/prisma'`

- `trigger/billing-scheduler.ts`, `trigger/billing-renewal.ts`, `trigger/renewal-jobs/*`
  - Já estavam no padrão v3 (sem alterações)

### 3.3 Backend app
- `src/lib/webhooks/emit-updated.ts` → `import { tasks } from '@trigger.dev/sdk/v3'`

### 3.3 Configuração
- `trigger.config.ts` (ok):
  - `import { defineConfig } from '@trigger.dev/sdk/v3'`
  - `project: "proj_naaseftufwbqfmmzzdth"`
  - `dirs: ["./trigger"]`
  - Política de retries e `maxDuration` definidas

### 3.4 Scripts utilitários
- `scripts/test-trigger-webhook.ts`: `import { tasks } from '@trigger.dev/sdk/v3'`
- `scripts/create-test-delivery.ts`: cria endpoint/event/delivery de teste e imprime `deliveryId`
- `scripts/list-clinics.ts`: lista `id` e `name` de clínicas
- `scripts/dev-trigger-delivery.ts`: 
  - `import { tasks } from '@trigger.dev/sdk/v3'`
  - `import { prisma } from '../src/lib/prisma'`
  - Modo A: dispara `deliver-webhook` com um `deliveryId`
  - Modo B: cria delivery (se passar URL do webhook.site) e dispara
  - Usa `tasks.trigger()` (fora de task não pode `triggerAndWait()`)

---

## 4) Build & Deploy (Trigger.dev Cloud)

### 4.1 Integração com Git
- Projeto conectado ao repo `kr-saas`, branch `main`.
- Cada push no `main` inicia um deploy no Trigger.dev.

### 4.2 Configurações recomendadas
- Build Settings (Trigger.dev → Settings → Build settings):
  - Install command: `npm install --legacy-peer-deps`
  - Pre-build command: `npx prisma generate`
- Node/engines: usar a mesma versão do projeto, se configurado.

### 4.3 Decisão arquitetural
- **Opção escolhida**: SDK v3 style (Option B)
- **Motivo**: Os jobs de renewal já estavam estáveis usando `@trigger.dev/sdk/v3` e `@/lib/prisma`. Para manter consistência e evitar regressões, padronizamos TODOS os jobs nesse estilo.
- **Risco mitigado**: O alias `@/` pode falhar em alguns bundlers, mas como os renewals já funcionam, mantemos o padrão existente e monitoramos deploys.

---

## 5) Ambientes e variáveis

### 5.1 Local (dev)
- `.env`: 
  - `TRIGGER_SECRET_KEY=tr_dev_...`
  - `DATABASE_URL=...`

### 5.2 Produção (Trigger.dev → Production)
- Environment variables obrigatórias:
  - `TRIGGER_SECRET_KEY=tr_prod_...`
  - `DATABASE_URL=...`
  - (Opcional) `DIRECT_URL=...`
- Se seu Postgres tem allowlist de IPs, liberar os IPs de egress do Trigger.dev.

### 5.3 App (Vercel)
- Definir `OUTBOUND_WEBHOOKS_ENABLED=false` para usar exclusivamente o Trigger.dev para entregas.

---

## 6) Como testar (E2E)

### 6.1 Criar delivery e testar pela UI do Trigger.dev
1. Obtenha uma URL de teste em `https://webhook.site` (HTTPS)
2. Liste clínicas disponíveis:
   ```bash
   npx tsx scripts/list-clinics.ts
   ```
3. Crie um delivery de teste:
   ```bash
   npx tsx scripts/create-test-delivery.ts https://webhook.site/SEU_ID_REAL CLINIC_ID=<clinic_id>
   ```
4. Copie o `deliveryId` impresso
5. Trigger.dev → Tasks → `deliver-webhook` → Test
6. Payload:
   ```json
   { "deliveryId": "DELIVERY_ID_AQUI" }
   ```
7. Acompanhe logs e confira o POST no webhook.site

### 6.2 Disparar via script (dev)
- Modo A: com delivery existente
  ```bash
  npx tsx scripts/dev-trigger-delivery.ts <delivery_id>
  ```
- Modo B: cria delivery e dispara
  ```bash
  npx tsx scripts/dev-trigger-delivery.ts https://webhook.site/SEU_ID_REAL CLINIC_ID=<clinic_id>
  ```
- O script imprime o handle da execução. Acompanhe em Trigger.dev → Runs.

---

## 7) Troubleshooting
- **Task não aparece no dashboard**
  - Checar Deployments → logs do último build.
  - Import `@/` dentro de `trigger/` é a causa mais comum.
  - Verificar `trigger.config.ts` (project ref e `dirs`).

- **Test (UI) falha na produção**
  - Confirmar `DATABASE_URL` e `TRIGGER_SECRET_KEY` no ambiente Production do Trigger.dev.
  - Checar se o DB aceita conexões do Trigger.dev (allowlist de IPs).

- **`triggerAndWait` lançou erro**
  - Só pode ser usado dentro de `task.run()`. Fora de task, use `tasks.trigger()`.

- **Webhook não chega**
  - Checar se a URL é HTTPS.
  - Ver cabeçalhos de assinatura (HMAC): `X-Webhook-Signature`, `X-Webhook-Timestamp`, `X-Webhook-Id`, `X-Webhook-Event`.
  - Ver se o endpoint respondeu `2xx`. Respostas não-2xx geram retry automático.

---

## 8) Rollback
- Para voltar ao worker manual (se existir no projeto):
  - Ajustar feature flag/env que habilita o worker manual (`OUTBOUND_WEBHOOKS_ENABLED=true`).
  - Desativar/criar schedule off para tasks do Trigger.dev, se necessário.

---

## 9) Próximos Passos
- **[env-prod]** Garantir `TRIGGER_SECRET_KEY (tr_prod_)` e `DATABASE_URL` no Trigger.dev (Production).
- **[allowlist]** Liberar IPs do Trigger.dev no Postgres, se aplicável.
- **[observabilidade]** Criar dashboards/alertas de falha em `deliver-webhook` (via Trigger.dev e logs do seu DB).
- **[hardening]** Validar política de retries e limites (tamanho do payload, tempo de timeout, etc.).

---

## 10) Referências de arquivos
- `trigger/deliver-webhook.ts`
- `trigger/check-stuck-deliveries.ts`
- `trigger.config.ts`
- `src/lib/webhooks/emit-updated.ts`
- `scripts/create-test-delivery.ts`
- `scripts/list-clinics.ts`
- `scripts/dev-trigger-delivery.ts`

---

## 11) Resumo Executivo
- **Baseline adotada**: SDK v3 style (Option B) - todos os jobs usam `@trigger.dev/sdk/v3` e `@/lib/prisma`.
- **Motivo**: Manter consistência com os jobs de renewal já estáveis e evitar regressões.
- **Correções aplicadas**: Padronizados `deliver-webhook` e `check-stuck-deliveries` no estilo v3, atualizados scripts utilitários.
- **Situação**: tasks listadas, deploy ok, testes funcionais via script/UI. Produção depende de ENV/DB acessível.
