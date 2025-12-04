// Token Source SPI - Abstração para obter contexto tokenizado
// Permite checkout continuar funcionando com ou sem KRX Secure

import type { TokenizedPaymentContext } from '@/lib/providers/base';
import type {
  BINInsights,
  RegisteredCard,
  NetworkTokenResult,
  CryptogramResult,
  ThreeDSSessionResult,
} from './types';
import type { KRXSecureFlags } from './flags';
import { getKRXSecureFlags } from './flags';
import { KRXSecureService } from './service';

/**
 * Token Source interface - abstrai a origem do token (legacy vs KRX Secure)
 */
export interface TokenSource {
  supportsInspect(): boolean;
  supportsVault(): boolean;
  supportsNetworkTokens(): boolean;
  supports3DS(): boolean;
  supportsFallback(): boolean;

  inspect(): Promise<BINInsights>;
  registerCard(input: {
    expiry: { month: string; year: string };
    customerId: string;
  }): Promise<RegisteredCard>;
  ensureNetworkToken(input: {
    evervaultCardId: string;
    merchantEvervaultId: string;
  }): Promise<NetworkTokenResult>;
  createCryptogram(input: { networkTokenId: string }): Promise<CryptogramResult>;
  create3DSSession(input: {
    card: { number: string; expiry: { month: string; year: string } };
    amount: number;
    currency: string;
  }): Promise<ThreeDSSessionResult>;
}

/**
 * Legacy Token Source (no-op) - usado quando KRX Secure está OFF
 */
class LegacyTokenSource implements TokenSource {
  supportsInspect() {
    return false;
  }
  supportsVault() {
    return false;
  }
  supportsNetworkTokens() {
    return false;
  }
  supports3DS() {
    return false;
  }
  supportsFallback() {
    return false;
  }

  async inspect(): Promise<BINInsights> {
    throw new Error('KRX Secure not enabled');
  }
  async registerCard(): Promise<RegisteredCard> {
    throw new Error('KRX Secure not enabled');
  }
  async ensureNetworkToken(): Promise<NetworkTokenResult> {
    throw new Error('KRX Secure not enabled');
  }
  async createCryptogram(): Promise<CryptogramResult> {
    throw new Error('KRX Secure not enabled');
  }
  async create3DSSession(): Promise<ThreeDSSessionResult> {
    throw new Error('KRX Secure not enabled');
  }
}

/**
 * KRX Secure Token Source - usa Evervault quando habilitado
 */
class KRXSecureTokenSource implements TokenSource {
  constructor(
    private ctx: {
      merchantId: string;
      cardToken: string; // token ev:...
      flags: KRXSecureFlags;
      service: KRXSecureService;
    }
  ) {}

  supportsInspect() {
    return this.ctx.flags.inspect;
  }

  supportsVault() {
    return this.ctx.flags.vault;
  }

  supportsNetworkTokens() {
    return this.ctx.flags.networkTokens;
  }

  supports3DS() {
    return this.ctx.flags['3ds'];
  }

  supportsFallback() {
    return this.ctx.flags.fallback;
  }

  async inspect(): Promise<BINInsights> {
    if (!this.supportsInspect()) {
      throw new Error('Inspect not enabled for this merchant');
    }
    return this.ctx.service.inspect(this.ctx.cardToken, this.ctx.merchantId);
  }

  async registerCard(input: {
    expiry: { month: string; year: string };
    customerId: string;
  }): Promise<RegisteredCard> {
    if (!this.supportsVault()) {
      throw new Error('Vault not enabled for this merchant');
    }
    return this.ctx.service.registerCard({
      token: this.ctx.cardToken,
      expiry: input.expiry,
      merchantId: this.ctx.merchantId,
      customerId: input.customerId,
    });
  }

  async ensureNetworkToken(input: {
    evervaultCardId: string;
    merchantEvervaultId: string;
  }): Promise<NetworkTokenResult> {
    if (!this.supportsNetworkTokens()) {
      throw new Error('Network tokens not enabled for this merchant');
    }
    return this.ctx.service.ensureNetworkToken({
      evervaultCardId: input.evervaultCardId,
      merchantEvervaultId: input.merchantEvervaultId,
      merchantId: this.ctx.merchantId,
    });
  }

  async createCryptogram(input: { networkTokenId: string }): Promise<CryptogramResult> {
    if (!this.supportsNetworkTokens()) {
      throw new Error('Cryptogram not enabled for this merchant');
    }
    return this.ctx.service.createCryptogram({
      networkTokenId: input.networkTokenId,
      merchantId: this.ctx.merchantId,
    });
  }

  async create3DSSession(input: {
    card: { number: string; expiry: { month: string; year: string } };
    amount: number;
    currency: string;
  }): Promise<ThreeDSSessionResult> {
    if (!this.supports3DS()) {
      throw new Error('3DS not enabled for this merchant');
    }
    return this.ctx.service.create3DSSession({
      card: input.card,
      amount: input.amount,
      currency: input.currency,
      merchantId: this.ctx.merchantId,
    });
  }
}

/**
 * Factory: retorna TokenSource apropriado baseado em flags
 */
export async function getTokenSource(input: {
  merchantId: string;
  cardToken: string; // token ev:... ou provider-native
  flags?: KRXSecureFlags;
}): Promise<TokenSource> {
  const flags = input.flags || (await getKRXSecureFlags(input.merchantId));

  if (!flags.enabled) {
    // KRX Secure OFF → retorna legacy (no-op)
    return new LegacyTokenSource();
  }

  // KRX Secure ON → retorna token source ativo
  const service = new KRXSecureService();
  return new KRXSecureTokenSource({
    merchantId: input.merchantId,
    cardToken: input.cardToken,
    flags,
    service,
  });
}

/**
 * Helper: converte TokenSource result para TokenizedPaymentContext
 */
export function toTokenizedContext(input: {
  networkToken?: NetworkTokenResult;
  cryptogram?: CryptogramResult;
  evervaultCardId?: string;
  insights?: BINInsights;
}): TokenizedPaymentContext | undefined {
  if (!input.networkToken) {
    return undefined;
  }

  return {
    networkTokenNumber: input.networkToken.dpan,
    cryptogram: input.cryptogram?.cryptogram,
    eci: input.cryptogram?.eci,
    evervaultCardId: input.evervaultCardId,
    brand: input.insights?.metadata?.brand,
    last4: input.insights?.metadata?.lastFour,
    expMonth: input.networkToken.expiry.month
      ? parseInt(input.networkToken.expiry.month)
      : undefined,
    expYear: input.networkToken.expiry.year
      ? parseInt(input.networkToken.expiry.year)
      : undefined,
    par: input.networkToken.par,
  };
}
