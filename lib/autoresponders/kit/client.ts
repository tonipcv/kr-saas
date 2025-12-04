import { prisma } from '@/lib/prisma';

export class KitClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  static async fromClinic(clinicId: string) {
    const row = await prisma.$queryRawUnsafe<Array<{ api_key_enc: string; iv: string }>>(
      `SELECT api_key_enc, iv FROM clinic_integrations WHERE clinic_id = $1 AND provider = 'KIT' LIMIT 1`,
      clinicId,
    );
    if (!row || row.length === 0) throw new Error('KIT not connected for this clinic');
    const { decryptSecret } = await import('@/lib/crypto');
    const apiKey = decryptSecret(row[0].iv, row[0].api_key_enc);
    return new KitClient(apiKey);
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      'X-Kit-Api-Key': this.apiKey,
    } as Record<string, string>;
  }

  private async handle(res: Response) {
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(text || `Kit API error ${res.status}`);
    }
    try { return JSON.parse(text); } catch { return text; }
  }

  async createSubscriber(input: any) {
    const res = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST', headers: this.headers(), body: JSON.stringify(input), cache: 'no-store'
    });
    return this.handle(res);
  }

  async updateSubscriber(subscriberId: number | string, input: any) {
    const res = await fetch(`https://api.kit.com/v4/subscribers/${encodeURIComponent(String(subscriberId))}` , {
      method: 'PUT', headers: this.headers(), body: JSON.stringify(input), cache: 'no-store'
    });
    return this.handle(res);
  }

  async addTag(subscriberId: number | string, tagId: number | string) {
    const res = await fetch('https://api.kit.com/v4/tags/subscribe', {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ subscriber_id: subscriberId, tag_id: tagId }), cache: 'no-store'
    });
    return this.handle(res);
  }

  async removeTag(subscriberId: number | string, tagId: number | string) {
    const res = await fetch('https://api.kit.com/v4/tags/unsubscribe', {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ subscriber_id: subscriberId, tag_id: tagId }), cache: 'no-store'
    });
    return this.handle(res);
  }

  async createPurchase(payload: any) {
    const res = await fetch('https://api.kit.com/v4/purchases', {
      method: 'POST', headers: this.headers(), body: JSON.stringify(payload), cache: 'no-store'
    });
    return this.handle(res);
  }
}
