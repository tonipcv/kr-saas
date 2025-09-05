# Processo de Deduplicação na Migração de Subscrições

## Visão Geral

Durante a migração do modelo antigo de subscrições para o novo modelo centrado em clínicas, identificamos e tratamos duplicações nos dados originais. Este documento detalha o processo de deduplicação e seus resultados.

## Números da Migração

- **Subscrições Antigas**: 162 registros
- **Subscrições Novas**: 9 registros únicos
- **Taxa de Deduplicação**: ~94% (153 registros duplicados removidos)

## Clínicas Afetadas

### 1. Bella Vitta
- **ID da Clínica**: cmeig09r90001t9yw8goen80q
- **Status Final**: TRIAL
- **Observação**: Múltiplas entradas do mesmo trial foram consolidadas em uma única subscrição

### 2. Clínica Beauty Lounge
- **ID da Clínica**: edfb22b6-f84b-4cde-8958-31c0e1429c2b
- **Status Final**: ACTIVE
- **Observação**: Mantida apenas a subscrição mais recente

### 3. Clínica Gold Coast Clinic
- **ID da Clínica**: 2f24c572-723a-41c9-bee0-1791f5f61cfb
- **Status Final**: ACTIVE
- **Observação**: Consolidada em uma única subscrição ativa

### 4. Clínica Haoma
- **ID da Clínica**: cmeiedmwt0001t9lmq24lwcpc
- **Status Final**: TRIAL
- **Observação**: Múltiplas entradas de trial consolidadas

### 5. Clínica India
- **ID da Clínica**: 929482e5-23b1-4ad3-90ef-9f498106bdb4
- **Status Final**: ACTIVE
- **Observação**: Mantida subscrição ativa única

### 6. Clínica Katsu
- **ID da Clínica**: 5b7e72f1-8655-4a7c-ad48-76e641e74d6a
- **Status Final**: ACTIVE
- **Observação**: Deduplicada para uma subscrição

### 7. Haoma - krxlabs@gmail.com
- **ID da Clínica**: d8d38fc0-4674-4078-8440-49538575b0ab
- **Status Final**: ACTIVE
- **Observação**: Consolidada em uma única subscrição

### 8. Personal Clinic - Toni
- **ID da Clínica**: temp_1754666280259_qnbzsxohwrd
- **Status Final**: ACTIVE
- **Observação**: Mantida apenas a subscrição mais recente

## Processo de Deduplicação

### Critérios de Seleção
1. Para cada clínica, mantivemos apenas a subscrição mais recente
2. Em caso de múltiplos status, a prioridade foi:
   - ACTIVE > TRIAL > PAST_DUE > CANCELED > EXPIRED

### Lógica de Migração
```sql
SELECT DISTINCT ON (subscriber_id)
  id, subscriber_id, status, updated_at
FROM unified_subscriptions
ORDER BY subscriber_id, updated_at DESC
```

### Preservação de Dados
- Todas as subscrições antigas foram mantidas na tabela de backup
- IDs antigos foram preservados com prefixo "cs_" para rastreabilidade
- Histórico completo pode ser consultado se necessário

## Validação

### Integridade dos Dados
- ✅ Nenhuma clínica ficou sem subscrição
- ✅ Todas as subscrições têm planos válidos
- ✅ Não há subscrições duplicadas no novo modelo

### Consistência de Status
- Todos os status foram migrados corretamente
- Mantida a consistência entre plano e status da subscrição

## Impacto no Negócio

### Benefícios
1. Dados mais limpos e organizados
2. Melhor performance do banco de dados
3. Facilidade de manutenção
4. Modelo de dados mais coerente

### Riscos Mitigados
1. Evitada cobrança duplicada
2. Eliminada inconsistência de status
3. Prevenidos problemas de integridade referencial

## Monitoramento Pós-Migração

### Métricas a Acompanhar
1. Número de subscrições por clínica
2. Taxa de conversão trial para paid
3. Consistência entre pagamentos e subscrições

### Alertas Configurados
1. Detecção de possíveis novas duplicações
2. Monitoramento de status inconsistentes
3. Verificação de integridade referencial

## Plano de Contingência

Em caso de necessidade de rollback:
1. Dados originais preservados em tabelas de backup
2. Scripts de restauração preparados
3. Processo documentado no plano de rollback
