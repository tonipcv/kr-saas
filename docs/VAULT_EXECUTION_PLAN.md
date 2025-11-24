# 🎯 Plano de Execução: VaultManager

## ✅ O que JÁ EXISTE

### Database
- ✅ `customer_payment_methods` completo
- ✅ `customer_provider` para IDs dos gateways

### Gateway SDKs
- ✅ Appmax: `tokenizeCard()`, `paymentsCreditCard()`
- ✅ Pagarme: `pagarmeCreateCustomer()`, `pagarmeCreateCustomerCard()`, `pagarmeCreateOrder()`
- ✅ Stripe: SDK básico

### Checkouts
- ✅ Appmax: tokeniza mas **NÃO salva** em `customer_payment_methods`
- ✅ Pagarme: cria card e **SALVA** em `customer_payment_methods`
- ✅ Stripe: recebe pm_ e **SALVA** em `customer_payment_methods`

### Trigger.dev
- ✅ `pagarme-prepaid-renewal`: usa `customer_payment_methods`
- ✅ `appmax-renewal`: usa `metadata.appmaxCardToken` (não usa tabela)
- ✅ `billing-renewal`: scheduler diário

### APIs
- ✅ `GET /api/payments/saved-cards`: lista cartões

## ❌ O que FALTA

1. **VaultManager** (service layer)
2. **Gateway adapters** padronizados
3. **POST /api/payments/cards/save**
4. **POST /api/payments/charge**
5. Appmax checkout salvar token
6. Appmax renewal usar `customer_payment_methods`

## 🎯 Plano (6 Fases)

### Fase 1: VaultManager
Criar `src/lib/payments/vault/manager.ts` com:
- `saveCard()`: salva token + fingerprint
- `listCards()`: lista por customer
- `charge()`: delega para gateway adapter

### Fase 2: Gateway Adapters
Criar interface comum e 3 adapters:
- `StripeGateway`: `paymentIntents.create({ off_session })`
- `PagarmeGateway`: `pagarmeCreateOrder({ card_id })`
- `AppmaxGateway`: `paymentsCreditCard({ token })`

### Fase 3: API Routes
- `POST /api/payments/cards/save`
- `POST /api/payments/charge`

### Fase 4: Appmax Checkout
Adicionar `VaultManager.saveCard()` após tokenizar

### Fase 5: Appmax Renewal
Trocar `metadata.appmaxCardToken` por `customer_payment_methods`

### Fase 6: Testes E2E
Testar salvar + cobrar por gateway
