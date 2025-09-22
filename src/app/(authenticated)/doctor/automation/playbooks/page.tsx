"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Playbook catalog definition
// channel values limited to: email | whatsapp | sms (map Push to sms; WhatsApp humano -> whatsapp)
// trigger_type strings are stored and can be implemented by executor later.

type Channel = 'email'|'whatsapp'|'sms';

type Playbook = {
  id: string;
  section: string; // e.g., "Reativação"
  name: string;
  trigger_type: string;
  trigger_config?: Record<string, any>;
  suggested_channels: Channel[];
  base_copy: string;
  objective: string;
};

const mapAnyChannel = (ch: string): Channel | null => {
  const v = ch.toLowerCase();
  if (v.includes('email')) return 'email';
  if (v.includes('whatsapp')) return 'whatsapp';
  if (v.includes('sms') || v.includes('push')) return 'sms';
  return null;
};

const CATALOG: Playbook[] = [
  // 1. Reativação (Core)
  { id: 'reactivation_30d', section: 'Reativação (Core)', name: 'Volte em 30 dias', trigger_type: 'customer_inactive_days', trigger_config: { days: 30 }, suggested_channels: ['whatsapp','email'], base_copy: 'Estamos com saudade! Volte esta semana e ganhe 10% de cashback.', objective: 'Evitar churn precoce' },
  { id: 'reactivation_60d', section: 'Reativação (Core)', name: 'Último aviso 60d', trigger_type: 'customer_inactive_days', trigger_config: { days: 60 }, suggested_channels: ['whatsapp'], base_copy: 'Sentimos sua falta! Última chance: bônus especial se reservar até amanhã.', objective: 'Recuperar cliente quase perdido' },
  { id: 'churn_salvage', section: 'Reativação (Core)', name: 'Churn salvage', trigger_type: 'predicted_churn', suggested_channels: ['whatsapp','sms'], base_copy: 'Ainda está com a gente? Aqui vai uma oferta VIP só pra você.', objective: 'Recuperar antes de perder' },
  // 2. Fidelização & Engajamento
  { id: 'vip_program', section: 'Fidelização & Engajamento', name: 'Programa VIP', trigger_type: 'new_customer', suggested_channels: ['whatsapp'], base_copy: 'Bem-vindo(a)! Acumule pontos e troque por prêmios. Você já ganhou 50 pontos de boas-vindas.', objective: 'Aumentar retenção desde o dia 1' },
  { id: 'points_goal', section: 'Fidelização & Engajamento', name: 'Meta de pontos', trigger_type: 'points_milestone', trigger_config: { points: 200, remaining_hint: 50 }, suggested_channels: ['whatsapp','sms'], base_copy: 'Você já tem 200 pontos! Só falta 50 para ganhar sua recompensa.', objective: 'Estimular próxima compra' },
  { id: 'vip_gold', section: 'Fidelização & Engajamento', name: 'VIP Gold', trigger_type: 'tier_reached', trigger_config: { tier: 'GOLD', threshold: 10 }, suggested_channels: ['email','whatsapp'], base_copy: 'Parabéns! Você virou membro GOLD. Cashback em dobro nos próximos 30 dias.', objective: 'Criar hábito, status, exclusividade' },
  // 3. Datas especiais
  { id: 'birthday', section: 'Datas especiais', name: 'Aniversário do cliente', trigger_type: 'customer_birthday', suggested_channels: ['whatsapp','email'], base_copy: '🎂 Feliz aniversário! Venha comemorar com um presente exclusivo.', objective: 'Humanizar a marca, criar surpresa' },
  { id: 'signup_anniversary', section: 'Datas especiais', name: 'Aniversário de cadastro', trigger_type: 'signup_anniversary', trigger_config: { years: 1 }, suggested_channels: ['email'], base_copy: 'Você está conosco há 1 ano! Obrigado. Aqui vai um bônus de fidelidade.', objective: 'Reforçar vínculo' },
  { id: 'seasonal', section: 'Datas especiais', name: 'Sazonal (ex.: Black Friday, Dia das Mães)', trigger_type: 'fixed_date', suggested_channels: ['whatsapp','email'], base_copy: 'Aproveite nossa promoção especial só hoje.', objective: 'Capturar demanda sazonal' },
  // 4. Expansão via Indicação
  { id: 'referral', section: 'Expansão via Indicação', name: 'Indique e ganhe', trigger_type: 'purchase_made', trigger_config: { referral: true }, suggested_channels: ['whatsapp'], base_copy: 'Indique 1 amigo e ganhe R$20 de cashback quando ele usar.', objective: 'Crescimento orgânico' },
  { id: 'referral_bonus', section: 'Expansão via Indicação', name: 'Bônus de indicação VIP', trigger_type: 'referrals_count_reached', trigger_config: { count: 3 }, suggested_channels: ['email','whatsapp'], base_copy: 'Você já indicou 3 amigos! Aqui está seu prêmio extra.', objective: 'Gamificação, viral loop' },
  // 5. Upsell & Cross-sell
  { id: 'cross_sell', section: 'Upsell & Cross-sell', name: 'Produto complementar', trigger_type: 'purchased_item_x', suggested_channels: ['whatsapp'], base_copy: 'Quem comprou X adorou Y. Experimente com desconto exclusivo.', objective: 'Aumentar ticket médio' },
  { id: 'recurring_plan', section: 'Upsell & Cross-sell', name: 'Plano recorrente', trigger_type: 'purchased_3_times_in_month', suggested_channels: ['email'], base_copy: 'Quer garantir desconto fixo? Assine nosso plano mensal.', objective: 'Converter cliente em assinante' },
  { id: 'prepaid_pack', section: 'Upsell & Cross-sell', name: 'Pacote pré-pago', trigger_type: 'active_frequent_customer', suggested_channels: ['whatsapp','email'], base_copy: 'Compre 10 sessões e pague 8. Oferta válida até sexta.', objective: 'Garantir receita antecipada' },
  // 6. Relacionamento humano
  { id: 'nps_feedback', section: 'Relacionamento humano', name: 'Feedback NPS', trigger_type: 'after_visit', suggested_channels: ['whatsapp'], base_copy: 'Como foi sua experiência hoje? Responda 0-10.', objective: 'Coletar dados, gerar referrals' },
  { id: 'nps_rescue', section: 'Relacionamento humano', name: 'Resgate de detrator', trigger_type: 'nps_low_score', trigger_config: { lt: 7 }, suggested_channels: ['whatsapp'], base_copy: 'Sentimos muito. Queremos ouvir você. Nosso gerente pode falar com você?', objective: 'Evitar perda, humanizar' },
  { id: 'nps_thanks', section: 'Relacionamento humano', name: 'Agradecimento promotor', trigger_type: 'nps_high_score', trigger_config: { gte: 9 }, suggested_channels: ['whatsapp'], base_copy: 'Obrigado pela nota! Indique amigos e ganhe bônus extra.', objective: 'Transformar fã em embaixador' },
  // 7. Finanças & Recorrência
  { id: 'subscription_renew', section: 'Finanças & Recorrência', name: 'Assinatura vencendo', trigger_type: 'subscription_expiring', trigger_config: { days_before: 7 }, suggested_channels: ['email','whatsapp'], base_copy: 'Sua assinatura expira em 7 dias. Renove agora com 10% off.', objective: 'Aumentar retenção de receita' },
  { id: 'payment_failed', section: 'Finanças & Recorrência', name: 'Pagamento falhou', trigger_type: 'payment_failed_webhook', suggested_channels: ['whatsapp'], base_copy: 'Não conseguimos processar sua última mensalidade. Clique aqui para atualizar.', objective: 'Reduzir churn involuntário' },
  { id: 'plan_upgrade', section: 'Finanças & Recorrência', name: 'Upgrade de plano', trigger_type: 'plan_usage_threshold', trigger_config: { usage_pct: 80 }, suggested_channels: ['email','whatsapp'], base_copy: 'Você está quase no limite do seu plano. Que tal migrar para o próximo?', objective: 'Aumentar ARPU' },
];

export default function PlaybooksPage() {
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groupBySection = CATALOG.reduce<Record<string, Playbook[]>>((acc, item) => {
    acc[item.section] = acc[item.section] || [];
    acc[item.section].push(item);
    return acc;
  }, {});

  const createCampaign = async (slug: string, title: string, description: string) => {
    const body = {
      campaign_slug: slug,
      title,
      description,
      status: 'PUBLISHED'
    };
    const res = await fetch('/api/v2/doctor/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json?.data?.id as string;
    // If already exists (409), try to find by title via search and return first match id
    if (res.status === 409) {
      try {
        const searchRes = await fetch(`/api/v2/doctor/campaigns?limit=10&search=${encodeURIComponent(title)}`, { cache: 'no-store' });
        const searchJson = await searchRes.json().catch(() => ({}));
        const list = Array.isArray(searchJson?.data) ? searchJson.data : [];
        const found = list.find((c: any) => (c?.title || '').toLowerCase() === title.toLowerCase());
        if (found?.id) return found.id as string;
      } catch {}
      throw new Error(`Campanha já existe para "${title}"`);
    }
    throw new Error(json?.error || `Falha ao criar campanha (${title})`);
  };

  const provisionPlaybook = async (pb: Playbook) => {
    try {
      setProvisioning(pb.id);
      setMessage(null);
      setError(null);

      // 1) Create campaigns for each suggested channel
      const created: Array<{ channel: Channel; id: string }> = [];
      for (const ch of pb.suggested_channels) {
        const slug = `${pb.id}-${ch}`;
        const title = `${pb.name} (${ch === 'email' ? 'Email' : ch === 'whatsapp' ? 'WhatsApp' : 'SMS'})`;
        const id = await createCampaign(slug, title, pb.base_copy);
        created.push({ channel: ch, id });
      }

      // 2) Create automation with multi-actions
      const actions = created.map(c => ({ type: 'send_campaign', channel: c.channel, campaignId: c.id }));
      const payload = {
        name: pb.name,
        trigger_type: pb.trigger_type,
        trigger_config: pb.trigger_config || {},
        actions
      };
      const res = await fetch('/api/v2/doctor/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Falha ao criar automação');

      setMessage(`Playbook "${pb.name}" provisionado com sucesso.`);
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado ao provisionar');
    } finally {
      setProvisioning(null);
    }
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="lg:ml-64">
        <div className="p-4 pt-[88px] lg:pl-6 lg:pr-4 lg:pt-6 lg:pb-4 pb-24 bg-gray-50 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Catálogo de Playbooks</h1>
              <p className="text-xs text-gray-500">SMB Loyalty & Reativação – provisionamento rápido</p>
            </div>
            <div className="flex gap-2">
              <Link href="/doctor/automation"><Button variant="outline" size="sm">Automações</Button></Link>
            </div>
          </div>

          {message && <div className="text-[12px] text-green-700 bg-green-50 border border-green-200 rounded-md p-2">{message}</div>}
          {error && <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-md p-2">{error}</div>}

          {Object.entries(groupBySection).map(([section, items]) => (
            <Card key={section} className="bg-white border border-gray-200 shadow-sm rounded-2xl">
              <CardHeader className="px-4 py-3 border-b border-gray-100">
                <CardTitle className="text-sm font-semibold text-gray-900">{section}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-3 space-y-3">
                {items.map(pb => (
                  <div key={pb.id} className="grid md:grid-cols-12 gap-2 items-center border-b last:border-b-0 border-gray-100 py-2">
                    <div className="md:col-span-3">
                      <div className="text-sm font-medium text-gray-900">{pb.name}</div>
                      <div className="text-[11px] text-gray-500">Trigger: {pb.trigger_type}</div>
                    </div>
                    <div className="md:col-span-3 text-[12px] text-gray-700">
                      Canais: {pb.suggested_channels.map(c => c === 'email' ? 'Email' : c === 'whatsapp' ? 'WhatsApp' : 'SMS').join(' + ')}
                    </div>
                    <div className="md:col-span-4 text-[12px] text-gray-700">
                      “{pb.base_copy}”
                    </div>
                    <div className="md:col-span-2 text-[12px] text-gray-500">
                      {pb.objective}
                    </div>
                    <div className="md:col-span-12 md:text-right">
                      <Button size="sm" onClick={() => provisionPlaybook(pb)} disabled={!!provisioning}>
                        {provisioning === pb.id ? 'Provisionando…' : 'Adicionar'}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
