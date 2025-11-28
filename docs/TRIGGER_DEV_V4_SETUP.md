# 🚀 Trigger.dev v4 - Setup Completo

**Status:** ✅ SDK v4 instalado  
**Próximo passo:** Deploy via Git

---

## 📋 O QUE VOCÊ TEM AGORA

- ✅ **SDK v4.1.2** instalado (`@trigger.dev/sdk`)
- ✅ **Jobs criados** (`trigger/deliver-webhook.ts`, `trigger/check-stuck-deliveries.ts`)
- ✅ **Configuração** (`trigger.config.ts`)
- ✅ **API Key** configurada no `.env`

---

## 🎯 COMO FUNCIONA TRIGGER.DEV V4

### Diferença Principal: Sem CLI Local

**v3 (antigo):**
```bash
npx @trigger.dev/cli dev  # Roda localmente
```

**v4 (novo):**
```bash
git push origin main      # Deploy automático
```

No v4, você **desenvolve normalmente** e faz **deploy via Git**. O Trigger.dev detecta automaticamente os jobs na pasta `trigger/` e faz deploy.

---

## 🚀 DEPLOY DOS JOBS (3 Passos)

### 1. **Conectar Repositório ao Trigger.dev**

1. Acesse: https://cloud.trigger.dev
2. Selecione seu projeto: `proj_naaseftufwbqfmmzzdth`
3. Vá em **Settings → Integrations**
4. Clique em **Connect GitHub**
5. Selecione o repositório: `krxscale-saas`
6. Configure:
   - **Branch de produção:** `main`
   - **Build command:** (deixe padrão)
   - **Environment:** Production

### 2. **Commit e Push**

```bash
# 1. Adicionar arquivos
git add trigger/deliver-webhook.ts
git add trigger/check-stuck-deliveries.ts
git add src/lib/webhooks/emit-updated.ts
git add src/lib/webhooks/bootstrap.ts
git add trigger.config.ts
git add package.json
git add docs/

# 2. Commit
git commit -m "feat: migrate webhooks to Trigger.dev v4"

# 3. Push
git push origin main
```

### 3. **Aguardar Deploy**

- Acesse: https://cloud.trigger.dev
- Vá em **Deployments**
- Aguarde ~2-3 minutos
- Status deve ficar: ✅ **Deployed**

---

## 🧪 TESTAR OS JOBS

### Opção 1: Dashboard (Recomendado)

1. Acesse: https://cloud.trigger.dev
2. Vá em **Tasks**
3. Você deve ver:
   - `deliver-webhook`
   - `check-stuck-deliveries`
4. Clique em `deliver-webhook`
5. Clique em **Test**
6. Payload de teste:
   ```json
   {
     "deliveryId": "test_delivery_id"
   }
   ```
7. Clique em **Run Test**

### Opção 2: E2E Real

1. Criar endpoint webhook apontando para https://webhook.site
2. Fazer checkout de teste na aplicação
3. Verificar no dashboard Trigger.dev:
   - Job executado
   - Logs completos
   - Status: sucesso
4. Verificar no webhook.site:
   - Payload recebido
   - Headers corretos

---

## 🔧 CONFIGURAÇÃO DE PRODUÇÃO

### Environment Variables (Vercel)

Adicione no Vercel (Settings → Environment Variables):

```bash
# Trigger.dev Production Secret Key
TRIGGER_SECRET_KEY=tr_prod_COLE_A_KEY_AQUI

# Desabilitar worker manual (migrado para Trigger.dev)
OUTBOUND_WEBHOOKS_ENABLED=false
```

**Obter Production Key:**
1. https://cloud.trigger.dev
2. Environments → Production
3. Copiar **Secret Key** (começa com `tr_prod_`)

---

## 📊 MONITORAMENTO

### Dashboard Trigger.dev

**URL:** https://cloud.trigger.dev

**Métricas disponíveis:**
- ✅ Taxa de sucesso por job
- ✅ Latência (p50, p95, p99)
- ✅ Volume de execuções
- ✅ Retry rate
- ✅ Logs completos de cada execução

### Alertas (Opcional)

1. Vá em **Settings → Alerts**
2. Adicionar webhook para Slack/Discord
3. Configurar eventos:
   - `task.failed` (job falhou)
   - `deployment.failed` (deploy falhou)

---

## 🐛 TROUBLESHOOTING

### Jobs não aparecem no dashboard

**Causa:** Deploy não completou ou erro no código

**Solução:**
1. Verificar **Deployments** no dashboard
2. Ver logs de build
3. Corrigir erros e fazer novo push

### Job executa mas falha

**Causa:** Erro no código do job

**Solução:**
1. Clicar no job no dashboard
2. Ver **Logs** da execução
3. Ver **Stack trace**
4. Corrigir código e fazer novo deploy

### Deliveries ficam PENDING

**Causa:** Job não está sendo disparado

**Solução:**
1. Verificar se `emit-updated.ts` está chamando `tasks.trigger()`
2. Verificar logs da aplicação
3. Verificar se há erro ao disparar job
4. Safety net vai re-disparar após 10 minutos

---

## 🎯 CHECKLIST FINAL

Antes de considerar completo:

- [ ] Repositório conectado ao Trigger.dev
- [ ] Deploy completado com sucesso
- [ ] Jobs aparecem no dashboard (`deliver-webhook`, `check-stuck-deliveries`)
- [ ] Teste E2E realizado (webhook.site)
- [ ] Webhook entregue com sucesso
- [ ] Assinatura HMAC validada
- [ ] Production env vars configuradas no Vercel
- [ ] Worker manual desabilitado (`OUTBOUND_WEBHOOKS_ENABLED=false`)
- [ ] Monitoramento configurado (alertas)

---

## 📚 RECURSOS

- **Dashboard:** https://cloud.trigger.dev
- **Docs v4:** https://trigger.dev/docs
- **Status:** https://status.trigger.dev
- **Support:** https://trigger.dev/discord

---

## 🎉 PRÓXIMOS PASSOS

1. **Agora:** Conectar repo + fazer deploy via Git
2. **Depois:** Testar E2E com webhook.site
3. **Produção:** Configurar env vars no Vercel
4. **Monitorar:** Dashboard por 24-48h

**Tudo pronto para deploy! 🚀**
