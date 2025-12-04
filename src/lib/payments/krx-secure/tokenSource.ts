// Token Source SPI (Phase 1 minimal): only Inspect support

import type { BINInsights, RegisteredCard } from './types';
import type { KRXSecureFlags } from './flags';
import { getKRXSecureFlags } from './flags';
// Reuse the main service implemented under project root /lib
// eslint-disable-next-line import/no-relative-parent-imports
import { KRXSecureService } from '../../../../lib/payments/krx-secure/service';

export interface TokenSource {
  supportsInspect(): boolean;
  inspect(): Promise<BINInsights>;
  // Fallback for Phase 1 when cardToken is not available but PAN is
  binLookupFromPan(pan: string): Promise<BINInsights>;
  // Vault: register card in Evervault before saving in provider
  registerCard(input: { token: string; expiry: { month: string; year: string }; merchantId: string; customerId: string }): Promise<RegisteredCard>;
}

class LegacyTokenSource implements TokenSource {
  supportsInspect() { return false; }
  async inspect(): Promise<BINInsights> { throw new Error('KRX Secure not enabled'); }
  async binLookupFromPan(): Promise<BINInsights> { throw new Error('KRX Secure not enabled'); }
  async registerCard(): Promise<RegisteredCard> { throw new Error('KRX Secure not enabled'); }
}

class KRXSecureTokenSource implements TokenSource {
  constructor(private ctx: { merchantId: string; cardToken: string; flags: KRXSecureFlags; service: KRXSecureService }) {}
  supportsInspect() { return !!this.ctx.flags.inspect; }
  async inspect(): Promise<BINInsights> {
    if (!this.supportsInspect()) throw new Error('Inspect not enabled');
    return this.ctx.service.inspect(this.ctx.cardToken, this.ctx.merchantId);
  }
  async binLookupFromPan(pan: string): Promise<BINInsights> {
    return this.ctx.service.binLookupFromPan(pan, this.ctx.merchantId);
  }
  async registerCard(input: { token: string; expiry: { month: string; year: string }; merchantId: string; customerId: string }): Promise<RegisteredCard> {
    return this.ctx.service.registerCard({
      token: input.token,
      expiry: input.expiry,
      merchantId: input.merchantId,
      customerId: input.customerId,
    });
  }
}

export async function getTokenSource(input: { merchantId: string; cardToken: string; flags?: KRXSecureFlags; }): Promise<TokenSource> {
  const flags = input.flags || (await getKRXSecureFlags(input.merchantId));
  if (!flags.enabled) return new LegacyTokenSource();
  const service = new KRXSecureService();
  return new KRXSecureTokenSource({ merchantId: input.merchantId, cardToken: input.cardToken, flags, service });
}
