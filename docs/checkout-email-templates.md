# Modelos de e-mails do Checkout (corpos completos)

Este arquivo consolida os corpos HTML e assuntos utilizados no checkout (compra/PIX) com placeholders para reutilização.

Referências no código:
- `src/app/api/checkout/create/route.ts`
- `src/app/api/payments/pagarme/webhook/route.ts`
- Layout base: `src/email-templates/layouts/base`

Observação: os HTML abaixo são inseridos em `baseTemplate({ content, clinicName })`, portanto incluem apenas o bloco `content` usado pelo layout padrão.

---

## 1) PIX gerado (checkout.create - síncrono)

Assunto:
```
[{{clinicName}}] PIX gerado
```

HTML:
```html
<div style="font-size:16px; color:#111;">
  <p style="font-size:20px; font-weight:600; margin:0 0 12px;">PIX gerado</p>
  <p style="margin:0 0 8px;">{{saudacaoNome}} seu PIX foi gerado para finalizar o pagamento.</p>
  <p style="margin:8px 0;">Valor: <strong>{{totalFormatted}}</strong></p>
  {{#if qr}}
  <p><a href="{{qr}}" target="_blank">Abrir QR Code do PIX</a></p>
  {{/if}}
  {{#if pixCopy}}
  <p style="word-break:break-all; font-size:12px; color:#444;">Copia e cola: {{pixCopy}}</p>
  {{/if}}
</div>
```

Placeholders:
- `{{clinicName}}`: nome da clínica
- `{{saudacaoNome}}`: "Olá {{customerName}}," ou "Olá,"
- `{{totalFormatted}}`: valor total formatado (ex.: R$ 100,00)
- `{{qr}}`: URL do QRCode (quando disponível)
- `{{pixCopy}}`: código EMV "copia e cola" (quando disponível)

---

## 2) Pagamento confirmado (checkout.create - síncrono)

Assunto:
```
[{{clinicName}}] Pagamento confirmado
```

HTML:
```html
<div style="font-size:16px; color:#111;">
  <p style="font-size:20px; font-weight:600; margin:0 0 12px;">Pagamento confirmado</p>
  <p style="margin:0 0 16px;">{{saudacaoNome}} recebemos o seu pagamento.</p>
  <table style="width:100%; font-size:14px; border-collapse:collapse;">
    {{#each items}}
    <tr>
      <td style="padding:6px 0;">{{name}}</td>
      <td style="padding:6px 0; text-align:right;">{{qty}}x</td>
    </tr>
    {{/each}}
  </table>
  <p style="margin-top:12px; font-weight:600;">Total: <span>{{totalFormatted}}</span></p>
</div>
```

Placeholders:
- `{{clinicName}}`: nome da clínica
- `{{saudacaoNome}}`: "Olá {{customerName}}," ou "Olá,"
- `{{items}}`: lista de itens `{ name, qty }`
- `{{totalFormatted}}`: valor total formatado

---

## 3) Pagamento confirmado (webhook Pagar.me - assíncrono)

Assunto:
```
[{{clinicName}}] Pagamento confirmado
```

HTML:
```html
<div style="font-size:16px; color:#111;">
  <p style="font-size:20px; font-weight:600; margin:0 0 12px;">Pagamento confirmado</p>
  <p style="margin:0 0 16px;">{{saudacaoNome}} recebemos o seu pagamento.</p>
  {{#if hasItems}}
  <table style="width:100%; font-size:14px; border-collapse:collapse;">
    <tr>
      <td style="padding:6px 0;">{{productName}}</td>
      <td style="padding:6px 0; text-align:right;">1x</td>
    </tr>
  </table>
  {{/if}}
  <p style="margin-top:12px; font-weight:600;">Total: <span>{{totalFormatted}}</span></p>
</div>
```

Placeholders:
- `{{clinicName}}`, `{{saudacaoNome}}`, `{{totalFormatted}}`
- `{{hasItems}}`: booleano; quando `true`, mostra a tabela de itens
- `{{productName}}`: quando disponível a partir do produto

Notas:
- Para PIX, há verificação adicional via `pagarmeGetOrder()` antes do envio.

---

## 4) Pagamento cancelado/recusado (webhook Pagar.me)

Assunto:
```
[{{clinicName}}] Pagamento cancelado
```

HTML:
```html
<div style="font-size:16px; color:#111;">
  <p style="font-size:20px; font-weight:600; margin:0 0 12px;">Pagamento não concluído</p>
  <p style="margin:0 0 16px;">{{saudacaoNome}} sua tentativa de pagamento foi cancelada ou não foi concluída.</p>
  <p style="margin-top:12px;">Você pode tentar novamente em nosso site. Se precisar de ajuda, responda este e-mail.</p>
</div>
```

Placeholders:
- `{{clinicName}}`, `{{saudacaoNome}}`

---

## Como usar com o layout base

No código, o HTML acima é embrulhado por `baseTemplate`:

```ts
const html = baseTemplate({ content, clinicName });
await sendEmail({ to, subject, html });
```

Substitua os placeholders antes de passar o `content` para o layout.
