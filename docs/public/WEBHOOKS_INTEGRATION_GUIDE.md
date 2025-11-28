# 🔗 Guia de Integração: Outbound Webhooks

## 📋 Visão Geral

Nossos webhooks permitem que você receba notificações em tempo real sobre eventos de pagamento na sua aplicação.

### Características

- ✅ **HTTPS obrigatório** - Segurança em todas as comunicações
- ✅ **Assinatura HMAC SHA-256** - Verificação de autenticidade
- ✅ **Retry automático** - Até 10 tentativas com backoff exponencial
- ✅ **Idempotência** - Mesmo evento nunca é processado duas vezes
- ✅ **Filtros avançados** - Por produto ou todos os eventos

---

## 🚀 Início Rápido

### 1. Criar Endpoint

Acesse **Integrações > Webhooks** e crie um novo endpoint:

- **URL:** `https://seu-dominio.com/webhooks` (HTTPS obrigatório)
- **Eventos:** Selecione os eventos desejados
- **Secret:** Salve em local seguro (será usado para validar assinaturas)
- **Filtros:** (Opcional) Selecione produtos específicos

### 2. Eventos Disponíveis

| Evento | Descrição | Quando é disparado |
|--------|-----------|-------------------|
| `payment.transaction.created` | Transação criada | Ao criar checkout |
| `payment.transaction.pending` | Aguardando pagamento | Pix/boleto gerado |
| `payment.transaction.processing` | Processando | Cartão em análise |
| `payment.transaction.succeeded` | Pagamento aprovado | Pagamento confirmado |
| `payment.transaction.failed` | Pagamento falhou | Cartão recusado |
| `payment.transaction.canceled` | Transação cancelada | Cancelamento manual |
| `payment.transaction.refunded` | Reembolso completo | Estorno total |
| `payment.transaction.partially_refunded` | Reembolso parcial | Estorno parcial |
| `payment.transaction.requires_action` | Requer ação | 3DS, autenticação |
| `payment.transaction.chargeback` | Chargeback | Contestação |

---

## 📦 Estrutura do Payload

Todos os webhooks seguem a mesma estrutura:

```json
{
  "specVersion": "1.0",
  "id": "evt_abc123",
  "type": "payment.transaction.succeeded",
  "createdAt": "2025-01-15T10:30:00Z",
  "attempt": 1,
  "idempotencyKey": "evt_abc123",
  "clinicId": "clinic_xyz",
  "resource": "payment_transaction",
  "data": {
    "transaction": {
      "id": "tx_def456",
      "status": "paid",
      "status_v2": "SUCCEEDED",
      "provider": "stripe",
      "providerOrderId": "pi_1234567890",
      "providerChargeId": "ch_1234567890",
      "amountCents": 10000,
      "currency": "BRL",
      "installments": 1,
      "paymentMethodType": "credit_card",
      "productId": "prod_123",
      "customerId": "cust_456",
      "paidAt": "2025-01-15T10:30:00Z",
      "createdAt": "2025-01-15T10:25:00Z",
      "updatedAt": "2025-01-15T10:30:00Z"
    },
    "checkout": {
      "id": "co_789",
      "email": "cliente@example.com",
      "phone": "+5511999999999",
      "name": "João Silva"
    },
    "product": {
      "id": "prod_123",
      "name": "Consulta Médica",
      "type": "SERVICE"
    },
    "offer": {
      "id": "off_456",
      "name": "Consulta - Plano Básico",
      "priceCents": 10000
    }
  }
}
```

### Campos Principais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `specVersion` | string | Versão da especificação (sempre "1.0") |
| `id` | string | ID único do evento |
| `type` | string | Tipo do evento (ex: `payment.transaction.succeeded`) |
| `createdAt` | string | Data/hora do evento (ISO 8601) |
| `attempt` | number | Número da tentativa de entrega (1-10) |
| `idempotencyKey` | string | Chave para idempotência (igual ao `id`) |
| `clinicId` | string | ID da clínica |
| `resource` | string | Tipo de recurso (sempre `payment_transaction`) |
| `data` | object | Dados do evento |

---

## 🔐 Verificando Assinaturas

**IMPORTANTE:** Sempre verifique a assinatura HMAC para garantir que o webhook veio da nossa plataforma.

### Headers Recebidos

```
X-Webhook-Signature: t=1735689600,v1=abc123def456...
X-Webhook-Timestamp: 1735689600
Content-Type: application/json
```

### Node.js / Express

```javascript
const crypto = require('crypto')

function verifyWebhook(payload, signature, timestamp, secret) {
  // 1. Verificar timestamp (max 5 minutos)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > 300) {
    throw new Error('Timestamp too old or in the future')
  }

  // 2. Extrair partes da assinatura
  const [tPart, v1Part] = signature.split(',')
  const receivedTimestamp = parseInt(tPart.split('=')[1], 10)
  const receivedSignature = v1Part.split('=')[1]

  // 3. Calcular assinatura esperada
  const signedPayload = `t=${receivedTimestamp}.${JSON.stringify(payload)}`
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex')

  // 4. Comparação timing-safe
  const valid = crypto.timingSafeEqual(
    Buffer.from(receivedSignature),
    Buffer.from(expectedSignature)
  )

  if (!valid) {
    throw new Error('Invalid signature')
  }

  return true
}

// Express.js
app.post('/webhooks', express.json(), (req, res) => {
  const signature = req.headers['x-webhook-signature']
  const timestamp = parseInt(req.headers['x-webhook-timestamp'])
  const secret = process.env.WEBHOOK_SECRET

  try {
    verifyWebhook(req.body, signature, timestamp, secret)
    
    // ✅ Webhook verificado! Processar evento
    console.log('Event:', req.body.type)
    console.log('Transaction ID:', req.body.data.transaction.id)
    
    // Retornar 200 rapidamente
    res.json({ received: true })
    
    // Processar async (recomendado)
    processWebhookAsync(req.body)
    
  } catch (error) {
    console.error('Webhook verification failed:', error)
    res.status(400).json({ error: 'Invalid signature' })
  }
})
```

### Python / Flask

```python
import hmac
import hashlib
import time
import json

def verify_webhook(payload, signature, timestamp, secret):
    # 1. Verificar timestamp
    now = int(time.time())
    if abs(now - int(timestamp)) > 300:
        raise ValueError("Timestamp too old or in the future")
    
    # 2. Extrair partes da assinatura
    parts = signature.split(',')
    t_part = parts[0].split('=')[1]
    v1_part = parts[1].split('=')[1]
    
    # 3. Calcular assinatura esperada
    signed_payload = f"t={t_part}.{json.dumps(payload)}"
    expected_signature = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    # 4. Comparação timing-safe
    if not hmac.compare_digest(v1_part, expected_signature):
        raise ValueError("Invalid signature")
    
    return True

# Flask
@app.route('/webhooks', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Webhook-Signature')
    timestamp = request.headers.get('X-Webhook-Timestamp')
    secret = os.getenv('WEBHOOK_SECRET')
    
    try:
        verify_webhook(request.json, signature, timestamp, secret)
        
        # ✅ Webhook verificado! Processar evento
        print('Event:', request.json['type'])
        print('Transaction ID:', request.json['data']['transaction']['id'])
        
        return {'received': True}
        
    except ValueError as e:
        return {'error': str(e)}, 400
```

### PHP / Laravel

```php
<?php

function verifyWebhook($payload, $signature, $timestamp, $secret) {
    // 1. Verificar timestamp
    $now = time();
    if (abs($now - (int)$timestamp) > 300) {
        throw new Exception('Timestamp too old or in the future');
    }
    
    // 2. Extrair partes da assinatura
    $parts = explode(',', $signature);
    $tPart = explode('=', $parts[0])[1];
    $v1Part = explode('=', $parts[1])[1];
    
    // 3. Calcular assinatura esperada
    $signedPayload = "t={$tPart}." . json_encode($payload);
    $expectedSignature = hash_hmac('sha256', $signedPayload, $secret);
    
    // 4. Comparação timing-safe
    if (!hash_equals($v1Part, $expectedSignature)) {
        throw new Exception('Invalid signature');
    }
    
    return true;
}

// Laravel
Route::post('/webhooks', function (Request $request) {
    $signature = $request->header('X-Webhook-Signature');
    $timestamp = $request->header('X-Webhook-Timestamp');
    $secret = env('WEBHOOK_SECRET');
    
    try {
        verifyWebhook($request->json()->all(), $signature, $timestamp, $secret);
        
        // ✅ Webhook verificado! Processar evento
        Log::info('Event: ' . $request->json('type'));
        Log::info('Transaction ID: ' . $request->json('data.transaction.id'));
        
        return response()->json(['received' => true]);
        
    } catch (Exception $e) {
        return response()->json(['error' => $e->getMessage()], 400);
    }
});
```

---

## ⚡ Best Practices

### 1. Retorne 200 Rapidamente

Seu endpoint deve responder em menos de 15 segundos. Processe o evento de forma assíncrona.

```javascript
app.post('/webhooks', async (req, res) => {
  // ✅ Retornar 200 ANTES de processar
  res.json({ received: true })
  
  // Processar async (fila, worker, etc)
  await queue.add('process-webhook', req.body)
})
```

### 2. Use Idempotência

Use o `idempotencyKey` para evitar processar o mesmo evento duas vezes.

```javascript
const processedEvents = new Set()

async function processWebhook(payload) {
  // Verificar se já processou
  if (processedEvents.has(payload.idempotencyKey)) {
    console.log('Event already processed:', payload.id)
    return
  }
  
  // Marcar como processado
  processedEvents.add(payload.idempotencyKey)
  
  // Processar...
  await updateOrder(payload.data.transaction)
}
```

### 3. Implemente Retry no Seu Lado

Mesmo com nossos retries, implemente lógica de retry no seu lado.

```javascript
async function handleWebhook(payload) {
  const maxRetries = 3
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await processEvent(payload)
      return // Sucesso
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error)
      if (i === maxRetries - 1) throw error
      await sleep(1000 * (i + 1)) // Backoff
    }
  }
}
```

### 4. Log Tudo

Mantenha logs detalhados para debugging.

```javascript
app.post('/webhooks', (req, res) => {
  const eventId = req.body.id
  const eventType = req.body.type
  
  console.log(`[${eventId}] Received: ${eventType}`)
  console.log(`[${eventId}] Attempt: ${req.body.attempt}`)
  console.log(`[${eventId}] Transaction: ${req.body.data.transaction.id}`)
  
  // ... processar
  
  console.log(`[${eventId}] Processed successfully`)
})
```

---

## 🧪 Testando Webhooks

### Teste com webhook.site

1. Acesse [webhook.site](https://webhook.site)
2. Copie a URL única gerada
3. Crie um endpoint na nossa plataforma com essa URL
4. Faça um checkout de teste
5. Veja o webhook chegar em tempo real

### Teste Local com ngrok

```bash
# 1. Instalar ngrok
brew install ngrok

# 2. Expor porta local
ngrok http 3000

# 3. Usar URL do ngrok no endpoint
# https://abc123.ngrok.io/webhooks
```

### Botão "Testar Endpoint"

Na tela de criação/edição do endpoint, use o botão **"Testar Endpoint"** para enviar um webhook de teste.

---

## 🔍 Debugging

### Verificar Logs

Acesse **Integrações > Webhooks > [Seu Endpoint]** para ver:

- ✅ Últimas 100 entregas
- ✅ Status (sucesso/falha)
- ✅ Tempo de resposta
- ✅ Corpo da resposta
- ✅ Erro (se houver)

### Reenviar Webhook

Se uma entrega falhar, você pode reenviar manualmente:

1. Clique na entrega falhada
2. Clique em **"Reenviar"**
3. Aguarde confirmação

### Problemas Comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| `Invalid signature` | Secret incorreto | Verifique o secret no código |
| `Timestamp too old` | Clock skew | Sincronize relógio do servidor |
| `Timeout` | Endpoint lento | Retorne 200 antes de processar |
| `SSL error` | Certificado inválido | Use certificado válido |
| `404 Not Found` | URL incorreta | Verifique a URL do endpoint |

---

## 📊 Schedule de Retry

Fazemos até **10 tentativas** com backoff exponencial:

| Tentativa | Delay | Tempo Total |
|-----------|-------|-------------|
| 1 | 0s | 0s |
| 2 | 1min | 1min |
| 3 | 5min | 6min |
| 4 | 15min | 21min |
| 5 | 1h | 1h 21min |
| 6 | 6h | 7h 21min |
| 7 | 24h | 31h 21min |
| 8 | 48h | 79h 21min |
| 9 | 72h | 151h 21min |
| 10 | 96h | 247h 21min |

Após 10 tentativas, o webhook é marcado como **FAILED** permanentemente.

---

## ❓ FAQ

### P: Quanto tempo vocês tentam reenviar?

**R:** Fazemos até 10 tentativas com backoff exponencial. A última tentativa acontece ~10 dias após a primeira.

### P: Posso filtrar eventos por produto?

**R:** Sim! Ao criar o endpoint, selecione "Filtrar por produtos" e escolha os produtos desejados.

### P: Como testo meu endpoint antes de ir pra produção?

**R:** Use o botão "Testar Endpoint" na tela de criação ou use [webhook.site](https://webhook.site) para ver os payloads.

### P: O que acontece se meu endpoint ficar fora do ar?

**R:** Continuaremos tentando conforme o schedule de retry. Se ultrapassar 10 tentativas, marcamos como falha definitiva, mas você pode reenviar manualmente.

### P: Posso ter múltiplos endpoints?

**R:** Sim! Você pode criar quantos endpoints quiser, cada um com seus próprios eventos e filtros.

### P: O payload tem limite de tamanho?

**R:** Sim, o payload máximo é **1MB**. Se ultrapassar, o webhook será marcado como FAILED.

### P: Vocês suportam HTTP (sem S)?

**R:** Não. Por segurança, apenas HTTPS é aceito.

---

## 📞 Suporte

Problemas? Entre em contato:

- **Email:** support@krxscale.com
- **Slack:** #webhooks-support
- **Docs:** https://docs.krxscale.com/webhooks

---

## 🔄 Changelog

### v1.0 (2025-01-15)

- ✅ Lançamento inicial
- ✅ 10 tipos de eventos
- ✅ Assinatura HMAC SHA-256
- ✅ Retry automático
- ✅ Filtros por produto
- ✅ Validação HTTPS
- ✅ Payload max 1MB

---

**Desenvolvido com ❤️ pela equipe KrxScale**
