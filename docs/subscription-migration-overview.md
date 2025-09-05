# Migração do Sistema de Subscrições

## Visão Geral

Este documento fornece uma visão geral completa da migração do sistema de subscrições para um modelo centrado em clínicas. A migração inclui mudanças no schema do banco de dados, APIs e lógica de negócios.

## Objetivos Alcançados

1. **Simplificação do Modelo**
   - Migração para subscrições exclusivamente no nível da clínica
   - Eliminação de duplicações e ambiguidades
   - Schema mais limpo e organizado

2. **Melhoria na Gestão de Dados**
   - Deduplicação de subscrições
   - Melhor rastreabilidade
   - Integridade referencial mais forte

3. **APIs Mais Consistentes**
   - Endpoints atualizados para novo modelo
   - Melhor tipagem e validação
   - Compatibilidade temporária mantida

## Componentes da Migração

### 1. Schema do Banco de Dados

#### Novas Tabelas
- `clinic_plans`
- `clinic_subscriptions`
- `clinic_add_ons`
- `clinic_add_on_subscriptions`

#### Novos Tipos
- `SubscriptionStatus`
- `PlanTier`
- `AddOnType`

### 2. Scripts de Migração

#### Principais Scripts
- `safe-subscription-migration.js`
- `validate-migration.js`
- `subscription-monitoring.sql`

#### Resultados
- 162 subscrições antigas → 9 subscrições únicas
- 90 planos antigos → 5 planos padronizados
- 4 planos órfãos identificados e documentados

### 3. APIs Atualizadas

#### Novos Endpoints
- `/api/subscription/current`
- `/api/admin/subscriptions`
- `/api/admin/subscriptions/[id]`

#### Camada de Serviço
- `SubscriptionService` para lógica centralizada
- Tipos TypeScript atualizados
- Funções de mapeamento e validação

## Mudanças no Modelo de Negócio

### 1. Planos Padronizados
- STARTER: Para clínicas pequenas
- GROWTH: Para clínicas em expansão
- ENTERPRISE: Para redes de clínicas

### 2. Add-ons
- Médicos adicionais
- Pacientes extras
- Recursos avançados
- Personalização

### 3. Papéis e Permissões
- OWNER: Dono do negócio
- MANAGER: Gerente administrativo
- PROVIDER: Profissional de serviço
- STAFF: Equipe de apoio

## Monitoramento e Manutenção

### 1. Métricas Principais
- Número de subscrições ativas
- Distribuição por plano
- Taxa de conversão de trial

### 2. Alertas
- Erros nas APIs
- Anomalias nos dados
- Problemas de integridade

### 3. Logs
- Mudanças de status
- Operações críticas
- Erros e exceções

## Plano de Rollback

Um plano detalhado de rollback foi documentado em `docs/subscription-rollback-plan.md`, incluindo:
- Procedimentos passo a passo
- Scripts de restauração
- Critérios de decisão
- Equipe responsável

## Próximos Passos

### 1. Curto Prazo
- Monitorar uso do novo sistema
- Coletar feedback dos usuários
- Ajustar conforme necessário

### 2. Médio Prazo
- Deprecar APIs antigas
- Expandir funcionalidades
- Melhorar documentação

### 3. Longo Prazo
- Remover código legado
- Otimizar performance
- Adicionar recursos avançados

## Documentação Relacionada

1. [Processo de Deduplicação](./subscription-migration-deduplication.md)
2. [Plano de Rollback](./subscription-rollback-plan.md)
3. [Plano de Migração das APIs](./api-migration-plan.md)

## Contatos

- **Tech Lead**: [Nome]
- **DBA**: [Nome]
- **Product Owner**: [Nome]

## Histórico de Versões

- v1.0.0 (2025-09-04): Migração inicial
- v1.0.1 (2025-09-04): Correções pós-migração
- v1.1.0 (2025-09-04): Atualização das APIs
