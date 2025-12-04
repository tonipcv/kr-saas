# Checkout email flow (compra e PIX)

Este documento lista todos os e-mails enviados durante o checkout quando o cliente faz uma compra e/ou gera um PIX, com referências ao código.

## Visão geral

- **Mecanismo**: `nodemailer` com fallback opcional para Resend em `src/lib/email.ts` (`sendEmail()`).
- **Layout**: `baseTemplate()` de `src/email-templates/layouts/base` é usado para compor o HTML.
- **Escopo**: Checkout via KRXPAY/Pagar.me e eventos de webhook Pagar.me. O fluxo AppMax não envia e-mail atualmente.

## Onde os e-mails são enviados

- **Checkout (KRXPAY/Pagar.me)**: `src/app/api/checkout/create/route.ts`
  - Envia e-mail imediatamente quando um PIX é gerado.
  - Envia e-mail de confirmação de pagamento se a transação for paga já na resposta do create.
- **Webhooks (Pagar.me)**: `src/app/api/payments/pagarme/webhook/route.ts`
  - Envia e-mail de confirmação quando o pagamento é confirmado (inclui verificação extra para PIX).
  - Envia e-mail quando o pagamento é cancelado/falhou.
- **AppMax**: `src/app/api/checkout/appmax/create/route.ts`
  - Não há envio de e-mails neste fluxo no momento.

## Detalhes por evento

- **PIX gerado (checkout.create - síncrono)**
  - Arquivo: `src/app/api/checkout/create/route.ts`
  - Trecho: `if (method === 'pix') { ... await sendEmail({ to: customerEmail, subject: \`[${clinicNameStr}] PIX gerado\`, html }) }`
  - Assunto: `[<Nome da Clínica>] PIX gerado`
  - Destinatário: `buyer.email`
  - Conteúdo: link/QR do PIX (`qr_code_url`) e código "copia e cola" (`qr_code`) quando disponíveis, valor total formatado.
  - Template: `baseTemplate({ content, clinicName })`

- **Pagamento confirmado (checkout.create - síncrono)**
  - Arquivo: `src/app/api/checkout/create/route.ts`
  - Condição: `paidNow = (charge.status === 'paid') || (last_transaction.status === 'paid')`
  - Assunto: `[<Nome da Clínica>] Pagamento confirmado`
  - Destinatário: `buyer.email`
  - Conteúdo: itens, quantidades e total.
  - Template: `baseTemplate({ content, clinicName })`

- **Pagamento confirmado (webhook Pagar.me - assíncrono)**
  - Arquivo: `src/app/api/payments/pagarme/webhook/route.ts`
  - Condição: status normalizado para `paid`. Para PIX, há verificação extra via `pagarmeGetOrder()` para evitar falsos positivos.
  - Assunto: `[<Nome da Clínica>] Pagamento confirmado`
  - Destinatário: e-mail do cliente (extraído de `event.data.customer.email` ou dos metadados/linha `payment_transactions`).
  - Conteúdo: valor total; layout base.
  - Template: `baseTemplate({ content, clinicName })`

- **Pagamento cancelado/recusado (webhook Pagar.me - assíncrono)**
  - Arquivo: `src/app/api/payments/pagarme/webhook/route.ts`
  - Condição: status mapeado para `canceled` ou `failed` (ou eventos de reembolso/cancelamento quando aplicável).
  - Assunto: `[<Nome da Clínica>] Pagamento cancelado`
  - Destinatário: e-mail do cliente (mesma lógica de extração acima).
  - Conteúdo: mensagem orientando a tentar novamente/contatar suporte.
  - Template: `baseTemplate({ content, clinicName })`

## Exemplos de referências no código

- `checkout.create` (linhas próximas a 1207–1237):
  - `await sendEmail({ to: customerEmail, subject: \`[${clinicNameStr}] PIX gerado\`, html })`
  - `await sendEmail({ to: customerEmail, subject: \`[${clinicNameStr}] Pagamento confirmado\`, html })`

- `pagarme/webhook` (linhas próximas a 740–744 e 1088–1091):
  - `await sendEmail({ to: toEmail, subject: \`[${clinicName}] Pagamento confirmado\`, html })`
  - `await sendEmail({ to: toEmail, subject: \`[${clinicName}] Pagamento cancelado\`, html })`

## Observações e flags

- **Env vars SMTP**: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD|SMTP_PASS`, `SMTP_FROM` devem estar configuradas. `SMTP_DISABLED=true` desabilita SMTP; com `RESEND_API_KEY` e `MAIL_FALLBACK_ALLOWED` o envio tenta Resend.
- **Idioma/branding**: O assunto inclui o nome da clínica. O HTML usa `baseTemplate` para padronizar marca e layout.
- **AppMax**: Sem e-mails no momento; se necessário, adicionar `sendEmail()` em `src/app/api/checkout/appmax/create/route.ts` após os pontos de sucesso/erro.

## Fora de escopo (relacionado a e-mail, não ao checkout)

- Vários endpoints de autenticação e referrals usam `sendEmail()` e `referral-email-service.ts`, mas não fazem parte do fluxo de checkout/PIX.
