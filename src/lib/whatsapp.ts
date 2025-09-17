const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE || 'https://graph.facebook.com';
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';

export type WhatsAppStatus = 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';

export async function getPhoneNumberInfo(accessToken: string, phoneNumberId: string) {
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WhatsApp getPhoneNumberInfo failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function sendWhatsAppText(accessToken: string, phoneNumberId: string, to: string, message: string) {
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: message },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WhatsApp send message failed: ${res.status} ${text}`);
  }
  return res.json().catch(() => ({}));
}

export async function verifyWebhook(params: URLSearchParams, verifyToken: string) {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (mode === 'subscribe' && token === verifyToken) {
    return { ok: true, challenge };
  }
  return { ok: false };
}
