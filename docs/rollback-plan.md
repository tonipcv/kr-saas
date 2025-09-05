# Plano de Rollback da Migração de Subscrições

Este documento descreve o plano de rollback para a migração do modelo de subscrições de médicos/clínicas para um modelo exclusivamente baseado em clínicas.

## 🚨 Pré-requisitos

1. **Backup do Banco de Dados**
   - Faça um backup completo do banco de dados antes de executar o rollback
   - Verifique se o backup pode ser restaurado em um ambiente de teste
   - Mantenha o backup disponível por pelo menos 30 dias

2. **Ambiente de Staging**
   - Teste o rollback em staging primeiro
   - Valide todas as funcionalidades críticas após o rollback
   - Documente quaisquer problemas encontrados e suas soluções

3. **Janela de Manutenção**
   - Agende uma janela de manutenção com a equipe
   - Notifique os usuários com antecedência
   - Tenha pelo menos 2 horas disponíveis para o processo

## 📝 Processo de Rollback

### 1. Preparação

```bash
# 1. Pare todos os serviços que acessam o banco de dados
pm2 stop all

# 2. Faça backup do banco de dados
pg_dump -h dpbdp1.easypanel.host -p 67 -U postgres -d zzz > backup_pre_rollback.sql

# 3. Verifique o backup
psql -h dpbdp1.easypanel.host -p 67 -U postgres -d zzz_test < backup_pre_rollback.sql
```

### 2. Execução

```bash
# 1. Defina a variável de ambiente para forçar o rollback
export FORCE_ROLLBACK=true

# 2. Execute o script de rollback
node scripts/rollback-subscription-migration.js

# 3. Verifique os logs em busca de erros
```

### 3. Validação

```bash
# 1. Verifique as contagens
psql -h dpbdp1.easypanel.host -p 67 -U postgres -d zzz -c "
SELECT 
  (SELECT COUNT(*) FROM unified_subscriptions WHERE type = 'CLINIC') as total_unified_subs,
  (SELECT COUNT(*) FROM clinic_members) as total_clinic_members,
  (SELECT COUNT(*) FROM clinics) as total_clinics;
"

# 2. Verifique as roles dos membros
psql -h dpbdp1.easypanel.host -p 67 -U postgres -d zzz -c "
SELECT role, COUNT(*) 
FROM clinic_members 
GROUP BY role 
ORDER BY role;
"

# 3. Verifique os planos
psql -h dpbdp1.easypanel.host -p 67 -U postgres -d zzz -c "
SELECT name, COUNT(*) 
FROM subscription_plans 
GROUP BY name 
ORDER BY name;
"
```

### 4. Restauração dos Serviços

```bash
# 1. Inicie os serviços
pm2 start all

# 2. Verifique os logs
pm2 logs

# 3. Monitore os endpoints críticos
curl -I https://api.zuzz.app/health
```

## 🔍 Pontos de Verificação

1. **Subscrições**
   - [ ] Todas as subscrições foram convertidas de volta
   - [ ] Os status estão corretos (ACTIVE, TRIAL)
   - [ ] As datas de início/fim estão preservadas
   - [ ] Os limites de médicos/pacientes estão corretos

2. **Membros**
   - [ ] Todas as roles foram revertidas (OWNER → ADMIN, etc.)
   - [ ] Os membros ainda têm acesso às suas clínicas
   - [ ] As permissões estão funcionando corretamente

3. **Planos**
   - [ ] Os planos foram recriados corretamente
   - [ ] Os preços e limites estão corretos
   - [ ] As features foram preservadas

4. **APIs**
   - [ ] Todos os endpoints estão funcionando
   - [ ] As respostas estão no formato esperado
   - [ ] Não há erros 500 nos logs

## 🚫 Problemas Conhecidos

1. **Duplicação de IDs**
   - Os IDs das novas subscrições são prefixados com `cs_`
   - Os IDs das subscrições antigas são mantidos como estão
   - Isso pode causar confusão temporária nos logs

2. **Cache**
   - O cache do Redis deve ser limpo após o rollback
   - Alguns usuários podem precisar fazer logout/login

3. **Webhooks**
   - Os webhooks do Stripe podem falhar temporariamente
   - Monitore a fila de webhooks por 24h após o rollback

## 🆘 Plano de Contingência

Se o rollback falhar:

1. **Pare Imediatamente**
   ```bash
   pm2 stop all
   ```

2. **Restaure o Backup**
   ```bash
   psql -h dpbdp1.easypanel.host -p 67 -U postgres -d zzz < backup_pre_rollback.sql
   ```

3. **Notifique a Equipe**
   - Informe o status no canal de emergência
   - Acione o time de plantão se necessário

4. **Documente o Problema**
   - Colete todos os logs relevantes
   - Faça screenshots de qualquer erro
   - Prepare um relatório do incidente

## 📞 Contatos

- **DevOps**: @devops-team
- **Backend**: @backend-team
- **Frontend**: @frontend-team
- **Suporte**: @support-team

## ✅ Checklist Final

- [ ] Backup realizado e verificado
- [ ] Rollback testado em staging
- [ ] Equipe notificada e disponível
- [ ] Janela de manutenção agendada
- [ ] Plano de contingência revisado
- [ ] Documentação atualizada
- [ ] Monitoramento configurado
