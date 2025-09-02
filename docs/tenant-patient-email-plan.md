# Tenant-Scoped Patient Auth Links & Branding

## Problema
- Paciente deve autenticar sempre sob o contexto do médico (tenant) em `/${slug}/login`.
- E-mails de paciente (esqueci senha/convite) hoje geram URLs globais (`/auth/reset-password` e `/auth/set-password`) sem `slug`.
- Páginas globais redirecionam para `/auth/signin`, quebrando o contexto do médico e a marca.

## Objetivo
- Todos os e-mails destinados a paciente devem conter links slugados: `/${doctorSlug}/reset-password?token=...` e `/${doctorSlug}/set-password?token=...`.
- Branding do médico (nome/logo) deve aparecer nos e-mails.
- Após set/reset de senha, redirecionar para `/${slug}/login`.

## Solução (Resumo)
1) Helper central para resolver slug/branding do médico a partir de `doctorId`.
2) Páginas slugadas para paciente: `src/app/[slug]/reset-password/page.tsx` e `src/app/[slug]/set-password/page.tsx` (redirecionam pós-sucesso para `/${slug}/login`).
3) Atualizar rotas de email:
   - `POST /api/auth/forgot-password`: aceitar `slug` opcional e, se presente, gerar URL slugada e branding do médico correspondente.
   - `POST /api/patients/[id]/send-password-reset`: persistir token, resolver `doctorSlug`, gerar URL slugada, usar template com branding.
4) Templates de e-mail: já suportam `clinicName/clinicLogo/doctorName`. Passaremos esses valores certos.

## Detalhes de Implementação
- Helper `src/lib/tenant-slug.ts`:
  - `getDoctorSlugByDoctorId(doctorId)` → string|null (procura clínica owned; senão membership ativa)
  - `getClinicBrandingByDoctorId(doctorId)` → `{ clinicName, clinicLogo, doctorName }`
- `src/app/[slug]/reset-password/page.tsx` e `src/app/[slug]/set-password/page.tsx`:
  - Base nas páginas globais atuais; leem `token` via `useSearchParams`.
  - Chamam as mesmas APIs (`/api/auth/validate-reset-token`, `/api/auth/reset-password`, `/api/auth/set-password`).
  - Redirecionam para `/${slug}/login` após sucesso.
- `src/app/api/auth/forgot-password/route.ts`:
  - Body `{ email, slug? }`.
  - Se `slug` informado e usuário for paciente desse médico (via `doctor_patient_relationship` ou `patientProfile`), gerar `${baseUrl}/${slug}/reset-password?token=...`.
  - Branding: obter `clinicName/logo` do médico identificado pelo `slug`.
  - Caso sem `slug`, manter `/auth/reset-password` (fluxo admin/doctor).
- `src/app/api/patients/[id]/send-password-reset/route.ts`:
  - Gerar token seguro (hash + expiry) e persistir em `user.reset_token[_expiry]`.
  - Resolver `doctorSlug` do `doctor.id` (da sessão) pelo helper.
  - Montar `${baseUrl}/${doctorSlug}/set-password?token=...` e enviar com template.

## Considerações de Segurança
- Tokens com hash + expiração (1h).
- Não revelar a existência de contas (respostas genéricas).
- Validar relação paciente↔médico antes de enviar e-mail.

## Pós-implementação
- Teste E2E: `/${slug}/forgot-password` → email → `/${slug}/reset-password` → sucesso → `/${slug}/login`.
- Teste envio de convite/reset via dashboard do médico (`send-password-reset`).

