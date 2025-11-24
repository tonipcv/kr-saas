# Appmax Production Integration - Correções Aplicadas

## Problema Original
403 "Missing Authentication Token" ao usar token de produção válido da Appmax.

## Root Causes Identificadas

### 1. **Base URL Incorreta** ❌ CRÍTICO
**Antes:**
```typescript
baseURL = 'https://api.appmax.com.br/api/v3' // ERRADO - host legado/inválido
```

**Depois:**
```typescript
baseURL = 'https://admin.appmax.com.br/api/v3' // CORRETO - host oficial
```

**Fonte:** Postman oficial, SDKs de terceiros (E-com Plus, Digital Manager Guru), Help Center Appmax.

### 2. **Token no Body (Desnecessário)** ⚠️
**Antes:**
```typescript
const payload = { ...(body || {}), ['access-token']: this.apiKey }
```

**Depois:**
```typescript
const payload = { ...(body || {}) } // Token vai apenas no header
```

**Motivo:** Padrão Appmax oficial usa token no **header** `access-token` ou **query string**, não no body POST.

### 3. **Headers Extras (Desnecessários)** ⚠️
**Antes:**
```typescript
headers = {
  'access-token': apiKey,
  'Access-Token': apiKey,  // extra
  'token': apiKey,         // extra
  'Authorization': `Bearer ${apiKey}` // ERRO - causava 403 diferente
}
```

**Depois:**
```typescript
headers = {
  'Content-Type': 'application/json',
  'access-token': apiKey  // apenas este
}
```

**Motivo:** Appmax espera apenas `access-token` (lowercase com hífen). O header `Authorization` causava erro "Invalid key=value pair".

### 4. **Flag digital_product Ausente** ⚠️
Adicionado suporte para infoprodutos no order payload:
```typescript
orderPayload = {
  ...
  digital_product: product?.type === 'DIGITAL' || product?.isDigital ? 1 : 0
}
```

## Correções Aplicadas

### Arquivo: `src/lib/payments/appmax/sdk.ts`

1. **Base URL de produção corrigida** (linha 14):
   ```typescript
   this.baseURL = explicit || (test 
     ? 'https://homolog.sandboxappmax.com.br/api/v3'  // sandbox OK
     : 'https://admin.appmax.com.br/api/v3')          // prod CORRIGIDO
   ```

2. **Token removido do body** (linha 20):
   ```typescript
   const payload = { ...(body || {}) } // sem access-token no body
   ```

3. **Headers simplificados** (linhas 21-24):
   ```typescript
   const headers: Record<string, string> = { 
     'Content-Type': 'application/json',
     'access-token': this.apiKey  // apenas este header
   }
   ```

4. **Logs detalhados adicionados** (linhas 46-56):
   ```typescript
   const tokenLen = this.apiKey ? this.apiKey.length : 0
   const tokenPreview = this.apiKey ? `${this.apiKey.slice(0, 8)}...${this.apiKey.slice(-8)}` : 'MISSING'
   console.log('[appmax][request]', { 
     url, path, attempt, tokenLen, tokenPreview,
     headersPresent: Object.keys(headers),
     payload: sanitize(payload) 
   })
   ```

### Arquivo: `src/app/api/checkout/appmax/create/route.ts`

1. **Flag digital_product adicionada** (linha 254):
   ```typescript
   digital_product: product?.type === 'DIGITAL' || product?.isDigital ? 1 : 0
   ```

### Arquivo: `src/app/(authenticated)/doctor/integrations/page.tsx`

1. **Validação contra tokens mascarados** (linhas 977-980):
   ```typescript
   if (trimmedKey.startsWith('***')) {
     toast.error('Please enter the full API key, not the masked value');
     return;
   }
   ```

2. **Não prefill de token mascarado** (linha 734):
   ```typescript
   setAppmaxApiKey(''); // força usuário a digitar token completo
   ```

## Padrão Oficial Appmax (Confirmado)

### Ambientes
- **Produção:** `https://admin.appmax.com.br/api/v3`
- **Sandbox:** `https://homolog.sandboxappmax.com.br/api/v3`

### Autenticação
- **Header:** `access-token: <API_KEY>`
- **Query String (alternativa):** `?access-token=<API_KEY>`
- **❌ NÃO usar:** `Authorization: Bearer <token>`

### Endpoints Principais
```
POST /customer          # Criar cliente
POST /order             # Criar pedido (com digital_product: 0|1)
POST /payment/credit-card   # Pagamento cartão
POST /payment/pix           # Pagamento PIX
POST /payment/boleto        # Pagamento boleto
POST /tokenize/card         # Tokenizar cartão
```

### Infoprodutos
```json
{
  "digital_product": 1,  // infoproduto (sem logística)
  "digital_product": 0   // produto físico (com frete)
}
```

## Como Testar

1. **Obter token de produção:**
   - Acessar `admin.appmax.com.br`
   - Menu → Aplicativos → API → + Instalar
   - Copiar a API Key gerada

2. **Salvar no sistema:**
   - Ir em `/business/integrations`
   - Clicar em Appmax
   - Colar o token **completo** (não mascarado)
   - **Desmarcar** "Test mode (sandbox)" para produção
   - Salvar

3. **Verificar logs:**
   ```
   [appmax][request] {
     url: 'https://admin.appmax.com.br/api/v3/customer',
     tokenLen: 35,  // deve ser ~35 para tokens válidos
     tokenPreview: 'E994DA4E...9339C84B',
     headersPresent: ['Content-Type', 'access-token'],
     ...
   }
   ```

4. **Resposta esperada:**
   ```
   [appmax][response] {
     status: 200,  // não mais 403
     body: { customer_id: 12345, ... }
   }
   ```

## Checklist de Produção

- [x] Base URL corrigida para `admin.appmax.com.br`
- [x] Token enviado apenas no header `access-token`
- [x] Token removido do body
- [x] Headers extras removidos
- [x] Flag `digital_product` implementada
- [x] Validação contra tokens mascarados
- [x] Logs detalhados para diagnóstico
- [x] `.trim()` no token para remover espaços

## Referências

- **Postman Oficial:** `admin.appmax.com.br/api/v3/*` endpoints
- **Help Center:** help.appmax.com.br (Integrando por API)
- **SDKs Terceiros:** E-com Plus, Digital Manager Guru (codefactor.io)
- **StackOverflow:** Exemplos reais de integração

## Status

✅ **Pronto para produção** - Todas as correções aplicadas e alinhadas com padrão oficial Appmax.
