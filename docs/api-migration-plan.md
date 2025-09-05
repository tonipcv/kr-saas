# Plano de Migração das APIs

## Visão Geral

Este documento detalha as mudanças necessárias nos endpoints da API para suportar o novo modelo de subscrições centrado em clínicas.

## Endpoints Afetados

### 1. Admin API

#### `/api/admin/clinics`
- **POST**: Atualizar criação de subscrição para usar `ClinicSubscription`
- **GET**: Adaptar para retornar novo formato de plano

#### `/api/admin/clinics/[id]`
- **PUT**: Migrar lógica de atualização de subscrição
- **DELETE**: Atualizar para remover `ClinicSubscription`

#### `/api/admin/subscriptions`
- **GET**: Adaptar para novo modelo de planos e subscrições
- **POST**: Atualizar para criar `ClinicSubscription`

#### `/api/admin/subscriptions/[id]`
- **GET**: Adaptar para novo formato de resposta
- **PUT**: Migrar para novo modelo
- **DELETE**: Atualizar para novo modelo

#### `/api/admin/dashboard-metrics`
- Atualizar queries para usar novas tabelas
- Adaptar cálculos de métricas

### 2. Public API

#### `/api/subscription/current`
- Adaptar para novo modelo de subscrições
- Remover lógica de subscrição de médico
- Focar em subscrição da clínica

#### `/api/auth/register/complete`
- Atualizar criação de subscrição trial

## Mudanças no Modelo de Dados

### Antes
\`\`\`typescript
interface Subscription {
  id: string
  type: 'DOCTOR' | 'CLINIC'
  subscriber_id: string
  plan: SubscriptionPlan
  status: string
  // ...
}
\`\`\`

### Depois
\`\`\`typescript
interface ClinicSubscription {
  id: string
  clinic_id: string
  plan: ClinicPlan
  status: SubscriptionStatus
  // ...
}
\`\`\`

## Estratégia de Migração

### Fase 1: Preparação
1. Criar novos tipos e interfaces
2. Implementar funções de conversão
3. Criar middlewares de compatibilidade

### Fase 2: Implementação
1. Atualizar endpoints um por um
2. Manter compatibilidade temporária
3. Adicionar logs de depreciação

### Fase 3: Limpeza
1. Remover código legado
2. Atualizar documentação
3. Comunicar clientes

## Exemplo de Implementação

### Middleware de Compatibilidade
\`\`\`typescript
function mapLegacyToNewSubscription(legacy: any): ClinicSubscription {
  return {
    id: \`cs_\${legacy.id}\`,
    clinic_id: legacy.subscriber_id,
    plan_id: legacy.plan_id,
    status: mapStatus(legacy.status),
    // ...
  };
}
\`\`\`

### Novo Endpoint
\`\`\`typescript
async function getClinicSubscription(clinicId: string) {
  const subscription = await prisma.clinicSubscription.findFirst({
    where: { clinic_id: clinicId },
    include: { plan: true }
  });
  
  return subscription;
}
\`\`\`

## Testes Necessários

1. Verificação de formato de resposta
2. Validação de status
3. Testes de integração
4. Testes de carga

## Monitoramento

1. Logs de erro específicos
2. Métricas de uso
3. Alertas de anomalia

## Rollback

Em caso de problemas:
1. Reverter para endpoints antigos
2. Restaurar dados via backup
3. Comunicar equipe de suporte

## Timeline Sugerida

1. Dia 1-2: Preparação e testes
2. Dia 3-4: Migração de endpoints admin
3. Dia 5: Migração de endpoints públicos
4. Dia 6-7: Testes e monitoramento
5. Dia 8+: Período de estabilização
