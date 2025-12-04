# Kit.com (Autoresponder) – Integração via API Key v4

## Objetivo

- Permitir conexão de uma clínica/médico à própria conta Kit.com para envios unidirecionais (Doctor → Kit).
- Usando apenas API Key v4 (sem OAuth, sem webhooks Kit → Doctor).

## Arquitetura

- Armazenamento de credenciais por clínica em `clinic_integrations` (provider = `KIT`).
- Endpoints Next.js para testar e salvar a API Key:
  - `POST /api/integrations/autoresponders/kit/test`
  - `POST /api/integrations/autoresponders/kit/save`
- SDK interno: `lib/autoresponders/kit/client.ts` (métodos: subscribers, tags, purchases).
- Opcional: worker assíncrono `kit.send` (não incluído neste passo).

## Endpoints

### Testar conexão

- Path: `POST /api/integrations/autoresponders/kit/test`
- Body:
```json
{ "clinicId": "<id>", "apiKey": "<kit_api_key>" }
```
- Regras:
  - Verifica sessão e acesso à clínica.
  - Faz `GET https://api.kit.com/v4/subscribers?limit=1` com header `X-Kit-Api-Key`.
  - Retorna `{ success: true }` quando 200.

### Salvar integração

- Path: `POST /api/integrations/autoresponders/kit/save`
- Body:
```json
{ "clinicId": "<id>", "apiKey": "<kit_api_key>" }
```
- Regras:
  - Verifica sessão e acesso à clínica.
  - Criptografa a chave com `encryptSecret()` e faz UPSERT em `clinic_integrations` (`provider='KIT'`).
  - Emite `integration_added` (actor=clinic, provider=kit).

## SDK interno

Arquivo: `lib/autoresponders/kit/client.ts`

- `KitClient.fromClinic(clinicId)` → resolve e decripta a API Key de `clinic_integrations`.
- Métodos suportados (v4):
  - `createSubscriber(input)` → `POST /v4/subscribers`
  - `updateSubscriber(subscriberId, input)` → `PUT /v4/subscribers/{id}`
  - `addTag(subscriberId, tagId)` → `POST /v4/tags/subscribe`
  - `removeTag(subscriberId, tagId)` → `POST /v4/tags/unsubscribe`
  - `createPurchase(payload)` → `POST /v4/purchases`

Observações:
- Todos usam header `X-Kit-Api-Key`.
- Implementar retry/timeout no call site se necessário ou evoluir o client futuramente.

## Segurança

- API Key nunca é retornada via endpoints.
- Criptografia em repouso em `clinic_integrations` (`api_key_enc` + `iv`).
- Checagem de acesso à clínica por sessão (owner/membro).

## Fluxo de ativação

1. Obter a API Key v4 no painel do Kit.com.
2. No app Doctor, ir em Integrações → Autoresponders → Kit.com.
3. Informar `clinicId`, colar a API Key e clicar “Testar conexão”.
4. Clicar “Salvar”. Status: `CONNECTED`.

## Exemplo de uso (server-side)

```ts
import { KitClient } from '@/lib/autoresponders/kit/client';

export async function onLeadCreated(clinicId: string, email: string, name?: string) {
  const kit = await KitClient.fromClinic(clinicId);
  await kit.createSubscriber({ email, first_name: name || undefined });
}
```

## Próximos passos (opcionais)

- Worker assíncrono `workers/autoresponders-kit-sender.ts` consumindo fila `kit.send`.
- UI: Card “Kit.com” em `src/app/(authenticated)/doctor/integrations/page.tsx` chamando os endpoints `test` e `save`.
- Mapeamento de eventos (lead_created → createSubscriber, tag +/- → subscribe/unsubscribe, purchase_made → createPurchase).
