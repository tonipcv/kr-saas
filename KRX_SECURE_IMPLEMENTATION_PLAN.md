# KRX Secure Implementation Plan

## ✅ FASE 0 COMPLETA: Foundation (Zero Runtime Impact)

### O que foi criado:

1. **Tipos e Interfaces** ✅
   - `lib/providers/base.ts` - Adicionado `TokenizedPaymentContext` (opcional)
   - `lib/payments/krx-secure/types.ts` - Tipos KRX Secure

2. **Feature Flags** ✅
   - `lib/payments/krx-secure/flags.ts` - Todos OFF por padrão
   - Mapping: ENTERPRISE = PRO, GROWTH = BASIC, STARTER = FREE

3. **Evervault Client** ✅
   - `lib/payments/krx-secure/evervaultClient.ts` - HTTP wrapper completo

4. **Metering** ✅
   - `lib/payments/krx-secure/metering.ts` - Tracking de custos e margem

5. **Service Layer** ✅
   - `lib/payments/krx-secure/service.ts` - Orquestrador principal

6. **Token Source SPI** ✅
   - `lib/payments/krx-secure/tokenSource.ts` - Abstração com fallback

7. **Schema** ✅
   - `prisma/schema.prisma` - Tabelas `KRXSecureUsage` e `VaultCard`

### Impacto: ZERO
- Nenhum código novo é executado
- Providers continuam funcionando normalmente
- Checkout inalterado

---

## 📋 PRÓXIMAS FASES

### FASE 1: Inspect Only (Semana 2) - Low Risk

**Objetivo**: Usar BIN lookup para melhorar roteamento (read-only)

**Mudanças**:
1. Adicionar no checkout antes de `selectProvider()`:
   ```typescript
   const tokenSource = await getTokenSource({
     merchantId: merchant.id,
     cardToken: body.cardToken,
   });
   
   let insights: BINInsights | undefined;
   if (tokenSource.supportsInspect()) {
     insights = await tokenSource.inspect();
   }
   
   // Passar insights para routing
   const selectedProvider = await selectProvider({
     merchantId,
     offerId,
     productId,
     country,
     method,
     insights, // ✅ Novo campo opcional
   });
   ```

2. Atualizar `src/lib/payments/core/routing.ts`:
   - Adicionar campo opcional `insights?: BINInsights` em `SelectProviderInput`
   - Usar `insights.metadata.brand`, `insights.metadata.funding` para decisões

**Rollout**:
- Ligar flag: `KRX_SECURE_ENABLED=true` + `inspect: true`
- Testar com 1-2 merchants ENTERPRISE
- Monitorar latência e success rate

**Rollback**: Desligar flag `inspect`

---

### FASE 2: Vault (Semana 3) - Medium Risk

**Objetivo**: Salvar cards no vault KRX Secure (PRO only)

**Mudanças**:
1. No checkout, após `inspect`:
   ```typescript
   let evervaultCardId: string | undefined;
   
   if (body.saveCard && tokenSource.supportsVault()) {
     try {
       const card = await tokenSource.registerCard({
         expiry: body.expiry,
         customerId: body.customerId,
       });
       evervaultCardId = card.evervaultCardId;
     } catch (error) {
       console.warn('Vault failed, continuing without:', error);
     }
   }
   ```

2. Webhook Stripe continua salvando PM nativo (não quebra)

**Rollout**:
- Ligar flag `vault: true` para merchants ENTERPRISE
- Testar com 5-10 merchants
- Validar deduplicação por fingerprint

**Rollback**: Desligar flag `vault`

---

### FASE 3: Network Tokens (Semana 4) - High Risk

**Objetivo**: Usar DPAN + cryptogram em vez de PAN (PRO only)

**Mudanças**:
1. No checkout, após `registerCard`:
   ```typescript
   let tokenizedContext: TokenizedPaymentContext | undefined;
   
   if (tokenSource.supportsNetworkTokens() && pspSupportsNetworkTokens(selectedProvider)) {
     try {
       const networkToken = await tokenSource.ensureNetworkToken({
         evervaultCardId: evervaultCardId!,
         merchantEvervaultId: merchant.evervaultMerchantId,
       });
       
       const cryptogram = await tokenSource.createCryptogram({
         networkTokenId: networkToken.networkTokenId,
       });
       
       tokenizedContext = toTokenizedContext({
         networkToken,
         cryptogram,
         evervaultCardId,
         insights,
       });
     } catch (error) {
       console.warn('Network token failed, using legacy:', error);
     }
   }
   
   // Passar para provider
   const result = await pspClient.createPayment({
     amount: body.amount,
     currency: body.currency,
     tokenized: tokenizedContext, // ✅ Pode ser undefined
   });
   ```

2. Helper `pspSupportsNetworkTokens()`:
   ```typescript
   function pspSupportsNetworkTokens(provider: PaymentProvider): boolean {
     // Apenas PSPs que aceitam DPAN + cryptogram
     return provider === PaymentProvider.STRIPE; // Expandir conforme necessário
   }
   ```

**Rollout**:
- Beta list (5 merchants ENTERPRISE confiáveis)
- Monitorar success rate vs legacy
- Graceful fallback se falhar

**Rollback**: Remover da beta list

---

### FASE 4: 3DS (Semana 5) - High Risk

**Objetivo**: Orquestrar 3DS com Evervault SDK

**Mudanças**:
1. No checkout, antes de `createPayment`:
   ```typescript
   if (requires3DS(body.amount, insights) && tokenSource.supports3DS()) {
     const session = await tokenSource.create3DSSession({
       card: { number: body.cardToken, expiry: body.expiry },
       amount: body.amount,
       currency: body.currency,
     });
     
     if (session.status === 'action-required') {
       return NextResponse.json({
         requiresAction: true,
         nextAction: session.nextAction,
         sessionId: session.sessionId,
       });
     }
     
     // Se passou, usar cryptogram da sessão
     if (session.cryptogram && tokenizedContext) {
       tokenizedContext.cryptogram = session.cryptogram;
       tokenizedContext.eci = session.eci;
     }
   }
   ```

2. Front-end: integrar Evervault SDK para challenge

**Rollout**:
- Apenas merchants com SCA obrigatório
- Testar flow completo (challenge + success)

**Rollback**: Desligar flag `3ds`

---

### FASE 5: Fallback (Semana 6) - Critical

**Objetivo**: Retry com PSP secundário em caso de falha

**Mudanças**:
1. Criar `lib/payments/routing/error-map.ts`:
   ```typescript
   export function shouldRetry(error: any, psp: PaymentProvider): boolean {
     const retriableCodes = PSP_ERROR_MAPS[psp]?.retriable || [];
     return retriableCodes.includes(error.code);
   }
   
   export function needsNewCryptogram(error: any, psp: PaymentProvider): boolean {
     const regenerateCodes = PSP_ERROR_MAPS[psp]?.regenerateCryptogram || [];
     return regenerateCodes.includes(error.code);
   }
   ```

2. No checkout, wrap `createPayment`:
   ```typescript
   try {
     result = await primaryPSP.createPayment({ ... });
   } catch (error) {
     if (tokenSource.supportsFallback() && shouldRetry(error, primaryPSP.provider)) {
       const secondaryPSP = selectFallbackPSP(primaryPSP, insights);
       
       if (needsNewCryptogram(error, primaryPSP.provider) && tokenizedContext) {
         const newCryptogram = await tokenSource.createCryptogram({
           networkTokenId: tokenizedContext.networkTokenId!,
         });
         tokenizedContext.cryptogram = newCryptogram.cryptogram;
       }
       
       result = await secondaryPSP.createPayment({ ... });
     } else {
       throw error;
     }
   }
   ```

**Rollout**:
- Apenas merchants PRO aprovados
- Max 1 retry (evitar cascata)
- Circuit breaker por PSP

**Rollback**: Desligar flag `fallback`

---

### FASE 6: Webhooks (Semana 7) - Low Risk

**Objetivo**: Sincronizar vault com eventos Evervault

**Mudanças**:
1. Criar `src/app/api/webhooks/krx-secure/route.ts`
2. Adicionar branch no `lib/queue/pgboss.ts`:
   ```typescript
   if (provider === 'EVERVAULT') {
     switch (event.type) {
       case 'payments.card.updated':
         await handleCardUpdated(event.data);
         break;
       case 'payments.network-token.updated':
         await handleNetworkTokenUpdated(event.data);
         break;
     }
   }
   ```

**Rollout**: Background job, sem impacto no checkout

---

## 🔧 Setup Necessário

### 1. Variáveis de Ambiente
```bash
# .env
EVERVAULT_APP_ID=app_xxx
EVERVAULT_API_KEY=ev_xxx
KRX_SECURE_ENABLED=false  # Master switch (OFF por padrão)
```

### 2. Migration Prisma
```bash
npx prisma migrate dev --name add_krx_secure_tables
npx prisma generate
```

### 3. Merchant Config (ENTERPRISE plan)
```json
{
  "features": {
    "krxSecure": {
      "inspect": true,
      "vault": true,
      "networkTokens": true,
      "cryptogram": true,
      "3ds": true,
      "fallback": true
    }
  }
}
```

---

## 📊 Monitoring

### Métricas Críticas
1. **Adoption**: % requests usando KRX Secure
2. **Success Rate**: Com KRX vs sem KRX
3. **Latency**: P50/P95/P99 por operação
4. **Cost**: Evervault cost vs KRX revenue
5. **Fallback Rate**: % de retries bem-sucedidos

### Dashboards
- Grafana: KRX Secure Operations
- Sentry: Error tracking por fase
- DataDog: Latency por merchant

---

## 🚨 Rollback Strategy

### Níveis
1. **Per-merchant**: Desabilitar via `Merchant.config`
2. **Per-operation**: Desligar flag específica
3. **Master switch**: `KRX_SECURE_ENABLED=false`
4. **Emergency**: Feature flag service (LaunchDarkly)

### SLA
- Rollback em < 5 minutos
- Zero data loss (vault persiste)
- Graceful degradation para legacy

---

## ✅ Checklist de Segurança

- [x] Campos opcionais apenas
- [x] Backward compatibility
- [x] Feature gates por plano
- [x] Graceful degradation
- [x] Idempotency (metering + vault)
- [x] PCI compliance (nunca decrypt)
- [x] Logs sem PAN
- [ ] Testes unitários
- [ ] Testes de integração
- [ ] Load testing
- [ ] Security audit

---

## 📝 Próximos Passos Imediatos

1. **Rodar migration**: `npx prisma migrate dev`
2. **Configurar env vars**: `EVERVAULT_APP_ID` e `EVERVAULT_API_KEY`
3. **Testar flags**: Verificar que tudo retorna `false` por padrão
4. **FASE 1**: Implementar inspect no checkout
5. **Monitorar**: Setup Grafana dashboard

---

## 🎯 Success Criteria

### Fase 1 (Inspect)
- ✅ Latency < 100ms P95
- ✅ Zero erros em produção
- ✅ Routing decisions melhoradas (logs)

### Fase 2 (Vault)
- ✅ Cards salvos corretamente
- ✅ Deduplicação funciona
- ✅ Zero quebra em legacy path

### Fase 3 (Network Tokens)
- ✅ Success rate >= baseline
- ✅ Latency < 200ms P95
- ✅ Fallback para legacy funciona

### Fase 4 (3DS)
- ✅ Challenge flow completo
- ✅ Cryptogram válido
- ✅ Zero timeout

### Fase 5 (Fallback)
- ✅ Retry rate < 5%
- ✅ Secondary PSP success > 80%
- ✅ Circuit breaker funciona

### Fase 6 (Webhooks)
- ✅ Eventos processados < 1min
- ✅ Vault atualizado corretamente
- ✅ Zero duplicação

---

## 💡 Notas Importantes

1. **Nunca quebrar o que funciona**: Checkout legado sempre deve funcionar
2. **Feature flags são rei**: Tudo controlado por flags
3. **Graceful degradation**: KRX falha → continua sem KRX
4. **Metering é crítico**: Sem metering = sem revenue
5. **Plan enforcement**: Vault/tokens/fallback apenas PRO (ENTERPRISE)

---

## 📚 Referências

- [Evervault API Docs](https://docs.evervault.com)
- [Network Tokens Guide](https://docs.evervault.com/payments/network-tokens)
- [3DS Integration](https://docs.evervault.com/payments/3ds)
- [Card Account Updater](https://docs.evervault.com/payments/cards)
