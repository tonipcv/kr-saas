# KRX Pay Branding Rules

## Regra Principal
**Pagarme é o gateway técnico por trás do KRX Pay. O usuário NUNCA deve ver "Pagarme" em nenhum lugar.**

## Mapeamento

### Enum no Prisma
- `KRXPAY` = valor público usado em TODAS as interfaces de usuário e persistência
- `PAGARME` = DEPRECADO, será removido em migração futura

### Normalização de Provider
```typescript
// SEMPRE usar esta função para normalizar providers antes de salvar no DB
function normalizeProviderForStorage(provider: string): PaymentProvider {
  const p = String(provider || '').toUpperCase();
  if (p === 'PAGARME') return 'KRXPAY'; // Converter legado
  return p as PaymentProvider;
}

// SEMPRE usar esta função para exibir providers no frontend
function normalizeProviderForDisplay(provider: string): string {
  const p = String(provider || '').toUpperCase();
  if (p === 'PAGARME' || p === 'KRXPAY') return 'KRX Pay';
  if (p === 'STRIPE') return 'Stripe';
  if (p === 'APPMAX') return 'Appmax';
  return p;
}
```

## Onde Aplicar

### ✅ Frontend (UI Components)
- `SmartChargeModal.tsx` - exibir "KRX Pay" para cartões KRXPAY
- Histórico de pagamentos - exibir "KRX Pay"
- Listagem de métodos de pagamento salvos - exibir "KRX Pay"
- Qualquer dropdown/select de providers - exibir "KRX Pay"

### ✅ Backend (APIs)
- `/api/payments/saved-cards` - retornar `provider: 'KRXPAY'` (não 'PAGARME')
- `/api/checkout/create` - salvar como `KRXPAY` no DB
- Webhooks - aceitar de Pagarme mas persistir como `KRXPAY`
- Logs internos - podem usar "pagarme" (lowercase) para debug, mas DB deve ter `KRXPAY`

### ✅ Banco de Dados
- `customer_providers.provider` → `KRXPAY`
- `customer_payment_methods.provider` → `KRXPAY`
- `payment_transactions.provider` → `krxpay` (lowercase)
- `payment_transactions.routed_provider` → `KRXPAY`
- `merchant_integrations.provider` → `KRXPAY`
- `payment_routing_rules.provider` → `KRXPAY`
- `offer_prices.provider` → `KRXPAY`

### ✅ SDK Interno
- `src/lib/payments/pagarme/sdk.ts` - pode manter nome do arquivo (é interno)
- Funções internas podem referenciar "pagarme" em nomes de variáveis
- MAS ao persistir dados, SEMPRE usar `KRXPAY`

## Migration Necessária

```sql
-- Atualizar registros existentes de PAGARME → KRXPAY
UPDATE customer_providers SET provider = 'KRXPAY' WHERE provider = 'PAGARME';
UPDATE customer_payment_methods SET provider = 'KRXPAY' WHERE provider = 'PAGARME';
UPDATE payment_transactions SET routed_provider = 'KRXPAY' WHERE routed_provider = 'PAGARME';
UPDATE merchant_integrations SET provider = 'KRXPAY' WHERE provider = 'PAGARME';
UPDATE payment_routing_rules SET provider = 'KRXPAY' WHERE provider = 'PAGARME';
UPDATE offer_prices SET provider = 'KRXPAY' WHERE provider = 'PAGARME';
```

## Checklist de Implementação

- [ ] Atualizar `SmartChargeModal.tsx` para exibir "KRX Pay"
- [ ] Atualizar `/api/payments/saved-cards` para retornar `KRXPAY`
- [ ] Atualizar `/api/checkout/create` para salvar `KRXPAY`
- [ ] Atualizar webhook handler para persistir `KRXPAY`
- [ ] Criar e executar migration SQL
- [ ] Atualizar componentes de histórico de pagamentos
- [ ] Remover enum `PAGARME` do schema (após migration)
- [ ] Buscar e substituir "Pagarme" em strings visíveis ao usuário

## Exceções (onde "pagarme" pode aparecer)

1. **Nomes de arquivos/pastas** - `src/lib/payments/pagarme/` (estrutura interna)
2. **Variáveis internas** - `pagarmeCreateOrder()` (função interna)
3. **Logs de debug** - `console.log('[pagarme] creating order')` (debug interno)
4. **Comentários de código** - `// Call Pagarme API` (documentação técnica)
5. **Credenciais/env vars** - `PAGARME_SECRET_KEY` (configuração)

## Status
- ✅ Documentação criada
- ⏳ Implementação em progresso
- ⏳ Migration pendente
- ⏳ Testes pendentes
