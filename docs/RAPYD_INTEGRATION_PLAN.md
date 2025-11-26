# Rapyd Integration Plan

## Contexto e Achados

- **Arquitetura atual**
  - `src/lib/payments/vault/manager.ts` usa adapters por gateway: `StripeGateway`, `PagarmeGateway` (KRXPAY), `AppmaxGateway`.
  - Adapters ficam em `src/lib/payments/vault/gateways/` e implementam `PaymentGateway` de `types.ts`.
  - **Roteamento de pagamentos** em `src/app/api/payment-routing/route.ts` define provedores válidos: `STRIPE`, `KRXPAY`, `APPMAX`. Rapyd ainda não está previsto.
  - **Webhooks** existentes: `src/app/api/stripe/webhook/route.ts` e `src/app/api/payments/pagarme/webhook/route.ts` (robustos, com persistência em `webhook_events` e `payment_transactions`).
  - **Integrações (credenciais por merchant)**: `src/app/api/integrations/stripe/*` e a função `getStripeFromClinicIntegration()` em `src/lib/payments/stripe/integration.ts` usam `merchantIntegration` no banco para buscar credenciais e validar ativação.
  - **Checkout/API**: múltiplas rotas em `src/app/api/payments/*` e `src/app/api/checkout/*`, além de `src/components/payments/*`.
- **Lacunas p/ Rapyd**
  - Não há provider `RAPYD` em enums/validações.
  - Não há adapter Rapyd em `vault/gateways`.
  - Não há rotas de webhook/integração p/ Rapyd.
  - UI de integrações não lista Rapyd.

## Objetivo
Habilitar Rapyd como provedor de pagamento compatível com a orquestração atual para CARD (e opcionalmente PIX/boletos BR), suportando:
- Tokenização e cobrança com cartão salvo (via `VaultManager.charge`).
- Webhooks idempotentes com mapeamento de status para `payment_transactions` e ativação de `customer_subscriptions` quando aplicável.
- Integração por merchant (credenciais por tenant em `merchantIntegration`).
- Roteamento por país/método em `payment-routing`.

## Escopo Técnico

- **Adapter Rapyd**
  - Criar `src/lib/payments/vault/gateways/rapyd.ts` implementando `PaymentGateway`.
  - Métodos:
    - `chargeWithSavedCard(params)`: usa Rapyd Payments API para criar uma cobrança off-session com cartão salvo/tokenizado.
  - Parâmetros Rapyd típicos:
    - `access_key`, `secret_key`, `salt`, `timestamp`, assinatura HMAC-SHA256 no header (`signature`).
    - `idempotency-key` por requisição.
    - `amount`, `currency`, `payment_method`, `customer`, `description`, `metadata`.
  - Credenciais devem ser obtidas do `merchantIntegration` do merchant (evitar .env), espelhando `getStripeFromClinicIntegration()`.

- **VaultManager**
  - Atualizar `getGateway()` para aceitar `'RAPYD'` e retornar `new RapydGateway()`.
  - Expandir `SaveCardParams.provider` e `listCards()` para suportar `'RAPYD'` (se houver validação/typing).

- **Integração por Merchant (API)**
  - Criar `src/app/api/integrations/rapyd/` com rotas para:
    - POST/PUT: salvar/atualizar credenciais em `merchantIntegration` com `provider = 'RAPYD'` e `isActive`.
    - GET: retornar status/credentials mask.
  - Campos esperados em `credentials`:
    - `accessKey`, `secretKey`, `webhookSecret` (ou equivalentes Rapyd), `accountId`/`ewallet` (quando aplicável), `region`.

- **Webhook Rapyd**
  - Criar `src/app/api/rapyd/webhook/route.ts`.
  - Verificação de assinatura Rapyd: construir assinatura com `access_key`, `secret_key`, `salt`, `timestamp`, método e path; comparar com header `signature`.
  - Persistir evento em `webhook_events` (como feito p/ Stripe/Pagarme) antes do processamento.
  - Normalizar eventos para atualizar `payment_transactions`:
    - Mapear tipos Rapyd: `payment.completed` → paid; `payment.failed` → failed; `payment.canceled` → canceled; `refund.completed` → refunded.
    - Preencher `provider_v2 = 'RAPYD'`, `status_v2` coerente e `paid_at`.
    - Usar `provider_order_id` e/ou `provider_charge_id` conforme IDs Rapyd (`payment.id`, `transaction.id`).
  - Assíncrono opcional via `WEBHOOK_ASYNC` como em Pagarme.

- **Roteamento de Pagamentos**
  - Atualizar `src/app/api/payment-routing/route.ts` para incluir `'RAPYD'` em `PROVIDERS`.
  - Se enums Prisma de `PaymentProvider` são usados, adicionar `'RAPYD'` na enum e migration.
  - Definir suporte por país/método: BR
    - CARD: suportado.
    - PIX/boletos: opcional conforme Rapyd account e região.

- **Endpoints de Pagamento (opcional/necessário)**
  - Se houver fluxo de tokenização/checkout card on-file:
    - `src/app/api/payments/tokenize` pode receber implementação Rapyd quando `provider=RAPYD`.
    - `src/app/api/payments/charge`/`charge-customer`: delegar a `VaultManager`.
  - Caso use apenas saved cards, garantir que `customer_payment_methods.provider` aceite `'RAPYD'`.

- **UI de Integrações**
  - Páginas: `src/app/(authenticated)/*/integrations/` e `.../integrations/payments/`.
  - Incluir Rapyd como opção, status de ativação, teste de webhook, e formulário para `accessKey`, `secretKey`, `webhookSecret`, `region`, `ewallet/accountId`.

- **Modelos/DB (Prisma)**
  - Garantir que enums e colunas aceitem `'RAPYD'`:
    - `PaymentProvider` (usado em `payment_routing_rules.provider`, `payment_transactions.provider_v2`, etc.).
    - `customer_payment_methods.provider`.
  - Se houver restrições de `CHECK`/enum no banco, criar migration para incluir `'RAPYD'`.

## Assinatura Rapyd (Resumo)
- Header fields típicos: `access_key`, `salt`, `timestamp`, `signature`.
- Base string: `method + path + salt + timestamp + access_key + secret_key + body`.
- `signature = base64(hmac_sha256(base_string, secret_key))`.
- Verificação deve rejeitar timestamps muito antigos (replay protection).

## Mapeamento de Status (Rapyd → Interno)
- `payment.completed` → `status = 'paid'`, `status_v2 = 'SUCCEEDED'`.
- `payment.failed` → `status = 'failed'`, `status_v2 = 'FAILED'`.
- `payment.canceled` → `status = 'canceled'`, `status_v2 = 'CANCELED'`.
- `refund.completed` → `status = 'refunded'`, `status_v2 = 'REFUNDED'`.
- Outros eventos → `processing/pending` conforme payload.

## Passo a Passo de Implementação

1) **Enums e Roteamento**
- Atualizar `src/app/api/payment-routing/route.ts`: adicionar `'RAPYD'` no objeto `PROVIDERS` e no tipo de retorno `pick()` se necessário.
- Criar migration Prisma para incluir `'RAPYD'` em `PaymentProvider` e onde mais se aplicar.

2) **Adapter Rapyd**
- Criar `src/lib/payments/vault/gateways/rapyd.ts` implementando `PaymentGateway` com:
```ts
class RapydGateway implements PaymentGateway {
  async chargeWithSavedCard(params: ChargeWithSavedCardParams): Promise<ChargeResult> {
    // 1) Resolver credenciais do merchant (merchantIntegration provider='RAPYD')
    // 2) Construir headers (salt, timestamp, signature)
    // 3) POST /v1/payments (ou endpoint de charge com token/payment_method)
    // 4) Mapear resposta para ChargeResult
  }
}
```
- Preferir credenciais por merchant em vez de `.env` (consistente com `getStripeFromClinicIntegration`).

3) **VaultManager**
- Alterar `getGateway()` para incluir case `'RAPYD'`.
- Se necessário, expandir types e union types para `'RAPYD'`.

4) **API de Integração**
- Criar `src/app/api/integrations/rapyd/route.ts` (ou arquivos por método) para CRUD das credenciais em `merchantIntegration`.
- Padrão de storage: `credentials: { accessKey, secretKey, webhookSecret, accountId/ewallet, region }`, `isActive`.

5) **Webhook**
- Criar `src/app/api/rapyd/webhook/route.ts` com:
  - Leitura do raw body.
  - Verificação de assinatura iterando sobre integrações ativas (como Stripe webhook faz) para suportar multi-tenant.
  - Persistência em `webhook_events` antes do processamento.
  - Upsert/Update em `payment_transactions` por `provider_order_id` e/ou `provider_charge_id` com anti-downgrade semelhante ao do Pagarme.
  - Ativação de `customer_subscriptions` quando aplicável a cobranças recorrentes.

6) **Tokenização/Checkout (se aplicável)**
- Se o fluxo usar on-file cards via Rapyd, criar/ajustar endpoints em `src/app/api/payments/tokenize` e `.../create` para suportar `provider=RAPYD`.
- Persistir `customer_payment_methods` com `provider='RAPYD'`, `providerPaymentMethodId=<token>` e dados de cartão.

7) **UI**
- Incluir Rapyd nas páginas em `src/app/(authenticated)/*/integrations/payments/` com formulário e health check da integração.

8) **Observabilidade**
- Logs moderados e sem dados sensíveis.
- Enfileirar reprocessamento com `WEBHOOK_ASYNC` como Pagarme quando necessário.

## Considerações de Segurança
- Nunca salvar `secretKey` em logs.
- Usar secrets por merchant em `merchantIntegration`; evitar `.env` para chaves de produção multi-tenant.
- Validar timestamps e idempotency keys.

## Testes e Validação
- **Unitários**: assinatura Rapyd (construção/verificação), mapeamento de status, adapter `chargeWithSavedCard`.
- **Integração**:
  - Happy path: cobrança aprovada → `payment_transactions` atualizado com `paid`.
  - Falha/cancelamento/refund → status mapeados.
  - Webhook com assinatura inválida → 401/400 e sem efeitos colaterais.
  - Multi-tenant webhook: escolhe merchant correto.
- **E2E**:
  - Roteamento define Rapyd para BR/CARD.
  - Fluxo de salvar cartão + cobrar via `VaultManager.charge(...)` com `provider='RAPYD'`.
  - UI de integrações ativa Rapyd e salva credenciais.

## Rollout Plan
- Feature flag para habilitar Rapyd por tenant.
- Deploy em staging com webhook apontando para `/api/rapyd/webhook`.
- Backfill/compatibilidade: nenhuma mudança destrutiva em esquema além de adicionar enum.
- Documentar passos de configuração do Rapyd Console (webhook URL, chaves, métodos ativados, moeda e país).

## Referências Internas
- `src/lib/payments/vault/manager.ts` (contrato e gravação em `payment_transactions`).
- `src/lib/payments/vault/gateways/types.ts` (interface do adapter).
- `src/lib/payments/vault/gateways/stripe.ts` (exemplo de adapter off-session).
- `src/app/api/payment-routing/route.ts` (PROVIDERS e regras por país/método).
- `src/app/api/stripe/webhook/route.ts` e `src/app/api/payments/pagarme/webhook/route.ts` (webhooks robustos como referência).
- `src/lib/payments/stripe/integration.ts` (padrão de credenciais por merchant).

## Itens a Implementar (Checklist)
- [ ] Adicionar `'RAPYD'` no roteamento e em enums Prisma (migration).
- [ ] Criar `RapydGateway` em `src/lib/payments/vault/gateways/rapyd.ts`.
- [ ] Alterar `VaultManager.getGateway()` para `'RAPYD'`.
- [ ] API `src/app/api/integrations/rapyd/*` para CRUD de credenciais.
- [ ] Webhook `src/app/api/rapyd/webhook/route.ts` com verificação de assinatura + upsert de transação.
- [ ] Suporte a tokenização/charge endpoints para `provider=RAPYD` (se necessário no fluxo atual).
- [ ] UI para gerenciar Rapyd nas páginas de integrações.
- [ ] Testes unitários/integrados e docs de configuração.
