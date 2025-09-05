# Workspace Selector Implementation - Estilo Notion

## 📋 Resumo
Implementação de um seletor de clínicas estilo Notion workspaces, onde o usuário pode alternar entre diferentes clínicas e todos os dados da aplicação são contextualizados pela clínica ativa.

## 🏗️ Arquitetura

### 1. Contexto Global (`ClinicContext`)
**Arquivo**: `src/contexts/clinic-context.tsx`

- **Estado Global**: Gerencia a clínica ativa em toda a aplicação
- **Persistência**: Salva a clínica selecionada no localStorage
- **Reatividade**: Dispara eventos quando a clínica muda
- **APIs**: Carrega todas as clínicas do usuário via `/api/clinics`

**Funcionalidades**:
- `currentClinic`: Clínica ativa atual
- `availableClinics`: Lista de todas as clínicas do usuário
- `switchClinic()`: Troca a clínica ativa
- `refreshClinics()`: Recarrega a lista de clínicas

### 2. Seletor no Sidebar (`SidebarClinicSelector`)
**Arquivo**: `src/components/ui/sidebar-clinic-selector.tsx`

- **Localização**: Integrado no menu principal (sidebar)
- **Visual**: Mostra logo, nome da clínica e plano atual
- **Dropdown**: Lista todas as clínicas disponíveis
- **Ações**: Permite trocar de clínica e criar nova clínica

**Features**:
- Avatar personalizado ou iniciais da clínica
- Badge do plano (TRIAL, ACTIVE, etc.)
- Contador de membros
- Indicação da clínica ativa
- Opção para criar nova clínica

### 3. APIs Atualizadas

#### `/api/clinics` (Nova)
**Arquivo**: `src/app/api/clinics/route.ts`
- **Função**: Lista todas as clínicas do usuário
- **Retorno**: `{ clinics: ClinicWithDetails[], total: number }`
- **Permissão**: Apenas médicos

#### `/api/clinic` (Modificada)
**Arquivo**: `src/app/api/clinic/route.ts`
- **Função**: Busca clínica específica ou principal
- **Parâmetro**: `?clinicId=xxx` (opcional)
- **Comportamento**: 
  - Com `clinicId`: Busca clínica específica
  - Sem `clinicId`: Busca/cria clínica principal

### 4. Função `getUserClinics()`
**Arquivo**: `src/lib/clinic-utils.ts`

- **Função**: Busca TODAS as clínicas do usuário (owner + membro)
- **Processamento**: Remove duplicatas e agrupa membros
- **Subscriptions**: Inclui dados do plano ativo
- **Retorno**: `ClinicWithDetails[]`

## 🔄 Fluxo de Funcionamento

### 1. Inicialização
1. Usuário faz login
2. `ClinicProvider` carrega todas as clínicas via `/api/clinics`
3. Seleciona clínica salva no localStorage ou a primeira disponível
4. `SidebarClinicSelector` mostra a clínica ativa

### 2. Troca de Clínica
1. Usuário clica no dropdown do sidebar
2. Seleciona outra clínica
3. `switchClinic()` atualiza o contexto
4. localStorage é atualizado
5. Evento `clinicChanged` é disparado
6. Componentes reagem à mudança

### 3. Dados Contextualizados
- **Página `/clinic`**: Usa `currentClinic` do contexto
- **APIs**: Recebem `clinicId` como filtro
- **Componentes**: Acessam via `useClinic()` hook

## 📁 Arquivos Modificados

### Novos Arquivos
- `src/contexts/clinic-context.tsx` - Contexto global
- `src/components/ui/sidebar-clinic-selector.tsx` - Seletor do sidebar
- `src/components/ui/dropdown-menu.tsx` - Componente dropdown
- `src/app/api/clinics/route.ts` - API para listar clínicas
- `docs/workspace-selector-implementation.md` - Esta documentação

### Arquivos Modificados
- `src/app/(authenticated)/layout.tsx` - Adicionado `ClinicProvider`
- `src/components/Navigation.tsx` - Integrado `SidebarClinicSelector`
- `src/app/(authenticated)/clinic/page.tsx` - Usa contexto global
- `src/app/api/clinic/route.ts` - Suporte a `clinicId` parâmetro
- `src/lib/clinic-utils.ts` - Nova função `getUserClinics()`

## 🎯 Benefícios

### 1. UX Melhorada
- **Familiar**: Interface similar ao Notion
- **Intuitiva**: Seletor no local esperado (sidebar)
- **Persistente**: Lembra a clínica selecionada

### 2. Arquitetura Limpa
- **Contexto Global**: Estado centralizado
- **Reatividade**: Mudanças automáticas
- **Separation of Concerns**: Lógica separada da UI

### 3. Escalabilidade
- **Multi-tenant**: Suporte natural a múltiplas clínicas
- **Extensível**: Fácil adicionar novos dados contextualizados
- **Performance**: Carregamento otimizado

## 🔮 Próximos Passos

1. **Filtrar APIs de Pacientes**: Usar `clinicId` como filtro
2. **Filtrar APIs de Protocolos**: Contextualizar por clínica
3. **Permissões por Clínica**: Verificar acesso baseado na clínica ativa
4. **Métricas por Clínica**: Dashboard contextualizado
5. **Notificações**: Filtrar por clínica ativa

## 🧪 Como Testar

1. **Login**: Entre como médico que possui múltiplas clínicas
2. **Sidebar**: Verifique o seletor no topo do menu
3. **Troca**: Clique e selecione outra clínica
4. **Persistência**: Recarregue a página e veja se mantém a seleção
5. **Dados**: Verifique se os dados mudam conforme a clínica

---

**Status**: ✅ Implementação Completa
**Última Atualização**: $(date)
