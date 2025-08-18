# Sistema de Indicações - Guia Completo

## 📋 Visão Geral

O sistema de indicações permite que pacientes indiquem outras pessoas para seus médicos e ganhem créditos que podem ser trocados por recompensas. Os médicos podem configurar recompensas e gerenciar as indicações recebidas.

## 🚀 Como Acessar

### Para Médicos:
1. **Painel de Indicações**: `/doctor/referrals`
   - Gerenciar indicações recebidas
   - Atualizar status das indicações
   - Ver estatísticas de conversão

2. **Configurar Recompensas**: `/doctor/rewards`
   - Criar recompensas personalizadas
   - Definir quantos créditos são necessários
   - Ativar/desativar recompensas

### Para Pacientes:
1. **Dashboard de Indicações**: `/patient/referrals`
   - Ver saldo de créditos
   - Histórico de indicações feitas
   - Resgatar recompensas disponíveis
   - Copiar link de indicação

## 🔗 Links de Indicação

### Como Funciona:
- Novo padrão (oficial): `/{doctor_slug}?code={referral_code}`
  - Ex.: `https://seusite.com/dr-joao?code=ABC123`
  - O parâmetro `code` é o código de indicação do paciente (gerado automaticamente via backend quando necessário)
- O sistema detecta automaticamente se a pessoa indicada já é paciente
- Importante: Os padrões legados com `/referral/[doctorId]` e `?ref=email` estão descontinuados e não devem ser usados em novas telas/APIs. Há redirecionamento de compatibilidade apenas para não quebrar links antigos.

### Geração de Links (novo padrão)
- Paciente: gerar par `(doctor_slug, referral_code)` e compor a URL `/{doctor_slug}?code={referral_code}`
  - `referral_code` é garantido via `ensureUserHasReferralCode(userId)` (backend)
  - `doctor_slug` vem do médico associado ao paciente (APIs: `/api/referrals/patient` ou `/api/v2/patients/referral`)
- Médico: link público do perfil é `/{doctor_slug}` (sem `code`)
  - O slug do médico pode ser lido em `/api/profile` (campo `doctor_slug`)
  - Base URL: `NEXT_PUBLIC_APP_URL`

## 💳 Sistema de Créditos

### Como Ganhar Créditos:
- **Indicação de novo paciente**: Créditos automáticos quando convertido
- **Indicação de paciente existente**: Créditos imediatos

### Como Usar Créditos:
- Resgatar recompensas configuradas pelo médico
- Créditos são debitados automaticamente no resgate

## 🎁 Sistema de Recompensas

### Para Médicos:
- Criar recompensas personalizadas
- Definir quantos créditos são necessários
- Configurar limite de resgates (opcional)
- Ativar/desativar recompensas

### Exemplos de Recompensas:
- Consulta gratuita (10 créditos)
- Desconto em exames (5 créditos)
- Produto gratuito (15 créditos)

## 📊 Status das Indicações

- **PENDING**: Indicação recebida, aguardando contato
- **CONTACTED**: Médico já entrou em contato
- **CONVERTED**: Pessoa se tornou paciente
- **REJECTED**: Pessoa não teve interesse

## 🔄 Fluxo Completo

1. **Paciente compartilha link** de indicação
2. **Pessoa preenche formulário** com seus dados
3. **Sistema verifica** se já é paciente existente
4. **Se novo**: Cria lead, envia notificações
5. **Se existente**: Atribui créditos imediatamente
6. **Médico gerencia** indicações no painel
7. **Paciente resgata** recompensas com créditos

## 🛠️ APIs Disponíveis

### Públicas:
- `POST /api/referrals/submit` - Enviar indicação
- `GET /api/referrals/doctor/by-slug/[slug]` - Info do médico por slug (padrão)
- `GET /api/referrals/resolve?doctor_slug=...&code=...` - Validação/resolução do par slug+code
  
Observação: `GET /api/referrals/doctor/[id]` existe apenas para compatibilidade e não deve ser usado em novas integrações.

### Médicos:
- `GET /api/referrals/manage` - Listar indicações
- `PUT /api/referrals/manage` - Atualizar status
- `GET/POST/PUT/DELETE /api/referrals/rewards` - Gerenciar recompensas

### Pacientes:
- `GET /api/referrals/patient` - Dashboard do paciente
- `POST /api/referrals/patient` - Resgatar recompensa

## 📧 Notificações por Email

### Automáticas:
- Médico recebe email quando há nova indicação
- Paciente recebe confirmação de indicação enviada
- Paciente recebe notificação quando ganha créditos

### Templates Personalizáveis:
- Localização em português
- Design responsivo
- Informações detalhadas

## 🔐 Segurança

- Validação de emails
- Prevenção de duplicatas
- Verificação de créditos antes do resgate
- Limite de resgates por recompensa
- Cooldown de 24h entre resgates da mesma recompensa

## 📱 Interface

### Design Responsivo:
- Funciona em desktop e mobile
- Interface intuitiva
- Feedback visual claro
- Estatísticas em tempo real

### Componentes:
- Cards informativos
- Tabelas organizadas
- Modais para ações
- Badges de status
- Botões de ação

## 🚀 Próximos Passos

1. **Testar o sistema** com dados reais
2. **Configurar emails** (SMTP)
3. **Personalizar recompensas** por médico
4. **Adicionar analytics** avançados
5. **Implementar notificações** push

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar logs do sistema
2. Testar APIs individualmente
3. Verificar configuração de email
4. Validar dados no banco (Prisma Studio)

---

**Sistema implementado e pronto para uso!** 🎉 