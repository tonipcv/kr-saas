# Plano de Rollback da Migração de Subscrições

## Visão Geral

Este documento detalha o processo de rollback para a migração do modelo de subscrições, caso seja necessário reverter as mudanças. O plano foi projetado para ser seguro e minimizar o impacto nos usuários.

## Pré-requisitos

1. Acesso ao banco de dados de produção
2. Backup das tabelas originais (já realizado durante a migração)
3. Janela de manutenção aprovada
4. Equipe de suporte disponível

## Etapas do Rollback

### 1. Preparação

```sql
-- Verificar se os backups existem
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'backup_unified_subscriptions_20250904'
);

-- Verificar integridade dos backups
SELECT COUNT(*) FROM backup_unified_subscriptions_20250904;
```

### 2. Parar Serviços

```bash
# Desativar endpoints de subscrição
feature_flags:set SUBSCRIPTION_MIGRATION_ACTIVE false

# Aguardar drenagem de conexões (2 minutos)
sleep 120
```

### 3. Backup de Segurança

```sql
-- Criar backup adicional das novas tabelas
CREATE TABLE backup_clinic_subscriptions_rollback AS
SELECT * FROM clinic_subscriptions;

CREATE TABLE backup_clinic_plans_rollback AS
SELECT * FROM clinic_plans;
```

### 4. Restaurar Dados Originais

```sql
-- Restaurar subscrições unificadas
INSERT INTO unified_subscriptions
SELECT * FROM backup_unified_subscriptions_20250904;

-- Restaurar planos originais
INSERT INTO subscription_plans
SELECT * FROM backup_subscription_plans_20250904;
```

### 5. Remover Novas Estruturas

```sql
-- Remover novas tabelas
DROP TABLE IF EXISTS clinic_subscriptions;
DROP TABLE IF EXISTS clinic_plans;
DROP TABLE IF EXISTS clinic_add_ons;
DROP TABLE IF EXISTS clinic_add_on_subscriptions;

-- Remover novos tipos
DROP TYPE IF EXISTS "PlanTier";
DROP TYPE IF EXISTS "AddOnType";
```

### 6. Verificação

```sql
-- Verificar contagens
SELECT COUNT(*) FROM unified_subscriptions;
SELECT COUNT(*) FROM subscription_plans;

-- Verificar integridade
SELECT c.id, c.name, us.id as subscription_id
FROM clinics c
LEFT JOIN unified_subscriptions us ON us.subscriber_id = c.id
WHERE c."isActive" = true AND us.id IS NULL;
```

### 7. Reativar Serviços

```bash
# Reiniciar serviços com configuração antiga
pm2 restart all

# Verificar logs
pm2 logs
```

## Pontos de Verificação

### Antes do Rollback
- [ ] Todos os backups disponíveis e íntegros
- [ ] Janela de manutenção confirmada
- [ ] Equipe de suporte notificada
- [ ] Plano revisado por DBA

### Durante o Rollback
- [ ] Screenshots dos dados antes de cada etapa
- [ ] Logs sendo coletados
- [ ] Equipe de monitoramento ativa

### Após o Rollback
- [ ] Contagens de registros conferem
- [ ] Não há clínicas ativas sem subscrição
- [ ] APIs respondendo corretamente
- [ ] Webhooks funcionando

## Tempo Estimado

1. Preparação: 15 minutos
2. Parada de serviços: 5 minutos
3. Backup de segurança: 10 minutos
4. Restauração: 20 minutos
5. Verificação: 15 minutos
6. Reativação: 10 minutos

**Total**: ~75 minutos

## Riscos e Mitigações

### Riscos Identificados

1. **Perda de Dados Recentes**
   - Mitigação: Backup incremental antes do rollback
   - Procedimento de reconciliação pós-rollback

2. **Inconsistência de Estado**
   - Mitigação: Verificações em cada etapa
   - Scripts de validação automatizados

3. **Falha na Restauração**
   - Mitigação: Múltiplos backups
   - Procedimento testado em staging

### Plano de Contingência

Se o rollback falhar:
1. Interromper imediatamente
2. Restaurar último backup conhecido bom
3. Escalar para equipe de DBA
4. Comunicar stakeholders

## Comunicação

### Antes do Rollback
- Notificar todos os stakeholders
- Preparar mensagem para usuários
- Alinhar com suporte técnico

### Durante o Rollback
- Updates a cada milestone
- Canais de comunicação dedicados
- Pessoa designada para comunicação

### Após o Rollback
- Relatório de conclusão
- Lições aprendidas
- Próximos passos

## Monitoramento Pós-Rollback

### Métricas Críticas
1. Número de subscrições ativas
2. Taxa de erro das APIs
3. Tempo de resposta dos endpoints
4. Consistência dos dados

### Alertas
1. Configurar alertas para anomalias
2. Monitoramento extra nas primeiras 24h
3. Dashboard dedicado para métricas críticas

## Suporte Pós-Rollback

### Equipe de Plantão
- DBA on-call
- Desenvolvedores de backend
- Equipe de infraestrutura
- Suporte ao cliente

### Documentação de Suporte
- Problemas conhecidos
- Soluções comuns
- Procedimentos de escalação

## Critérios de Sucesso

1. Todos os dados restaurados corretamente
2. Nenhuma perda de informação crítica
3. Sistemas operando normalmente
4. Usuários podem acessar normalmente
5. Não há erros nos logs

## Aprovações Necessárias

- [ ] Tech Lead
- [ ] DBA
- [ ] Product Owner
- [ ] Infraestrutura
- [ ] Segurança
