import { z } from 'zod';

export type Intent = 'greeting' | 'schedule' | 'pricing' | 'hours' | 'human' | 'unknown';

export interface ClassifiedIntent {
  intent: Intent;
  confidence: number; // 0..1
}

export function classifyIntent(text: string): ClassifiedIntent {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return { intent: 'unknown', confidence: 0.0 };

  // Greetings
  if (/(^|\b)(oi|olá|ola|bom dia|boa tarde|boa noite|hello|hi)(\b|!|\.)/i.test(t)) {
    return { intent: 'greeting', confidence: 0.9 };
  }
  // Schedule/Appointment
  if (/(agenda(r|mento)?|marcar|consulta|appointment|book|agendar)/i.test(t)) {
    return { intent: 'schedule', confidence: 0.85 };
  }
  // Pricing/Services
  if (/(preço|precos|valor|quanto|price|cost|serviç|services|tabela)/i.test(t)) {
    return { intent: 'pricing', confidence: 0.8 };
  }
  // Hours/Address
  if (/(horário|horario|funcionamento|abrem|fecham|hours|address|endereço)/i.test(t)) {
    return { intent: 'hours', confidence: 0.75 };
  }
  // Human handoff
  if (/(humano|atendente|pessoa|falar com alguém|atendimento)/i.test(t)) {
    return { intent: 'human', confidence: 0.9 };
  }

  return { intent: 'unknown', confidence: 0.3 };
}

export function generateReply(ci: ClassifiedIntent): string | null {
  switch (ci.intent) {
    case 'greeting':
      return 'Olá! Sou o assistente virtual da clínica. Posso ajudar com: agendar consulta, preços/serviços, horários ou falar com um atendente.';
    case 'schedule':
      return 'Perfeito! Para agendar sua consulta, poderia informar o melhor dia/horário? Se preferir, encaminho para um atendente.';
    case 'pricing':
      return 'Temos diferentes serviços e pacotes. Posso enviar uma lista resumida ou conectar você com um atendente para detalhes.';
    case 'hours':
      return 'Nosso horário é de segunda a sexta, 9h às 18h. Precisa de algum horário específico?';
    case 'human':
      return 'Sem problemas! Vou encaminhar sua mensagem para um atendente humano. Eles responderão em breve.';
    case 'unknown':
    default:
      return 'Obrigado pela mensagem! Para agilizar, posso ajudar com agendamento, preços/serviços ou horários. Se preferir, peço para um atendente responder.';
  }
}

export function shouldAutoReply(ci: ClassifiedIntent): boolean {
  // MVP: responder todos exceto quando confiança muito baixa
  return (ci.confidence ?? 0) >= 0.5;
}
