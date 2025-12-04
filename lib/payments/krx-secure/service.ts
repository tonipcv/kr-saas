// KRX Secure Service - Orquestrador principal sobre Evervault

import { prisma } from '@/lib/prisma';
import { EvervaultClient } from './evervaultClient';
import { KRXSecureMetering } from './metering';
import type {
  BINInsights,
  RegisteredCard,
  NetworkTokenResult,
  CryptogramResult,
  ThreeDSSessionResult,
} from './types';

export class KRXSecureService {
  private evervault: EvervaultClient;
  private metering: KRXSecureMetering;

  constructor() {
    const appId = process.env.EVERVAULT_APP_ID;
    const apiKey = process.env.EVERVAULT_API_KEY;

    if (!appId || !apiKey) {
      throw new Error('EVERVAULT_APP_ID and EVERVAULT_API_KEY must be set');
    }

    this.evervault = new EvervaultClient({ appId, apiKey });
    this.metering = new KRXSecureMetering();
  }

  // ──────────────────────────────────────────────────────
  // Inspect (BIN lookup) - disponível para todos os planos
  // ──────────────────────────────────────────────────────
  async inspect(token: string, merchantId: string): Promise<BINInsights> {
    const result = await this.evervault.inspect(token);

    // Meter operação
    const pricing = this.metering.getUnitCost('inspect');
    await this.metering.record({
      merchantId,
      operation: 'inspect',
      evervaultCost: pricing.evervaultCost,
      krxPrice: pricing.krxPrice,
      metadata: { fingerprint: result.fingerprint },
    });

    return result;
  }

  // ──────────────────────────────────────────────────────
  // Fallback Inspect usando PAN (BIN Lookup direto)
  // ──────────────────────────────────────────────────────
  async binLookupFromPan(pan: string, merchantId: string): Promise<BINInsights> {
    const resp: any = await this.evervault.binLookup(String(pan).slice(0, 9));
    // Meter operação como insights.full
    const pricing = this.metering.getUnitCost('insights.full');
    await this.metering.record({
      merchantId,
      operation: 'insights.full',
      evervaultCost: pricing.evervaultCost,
      krxPrice: pricing.krxPrice,
      metadata: { bin: String(pan).slice(0, 9), source: 'bin-lookup' },
    });

    const brand = resp?.brand || resp?.scheme || resp?.cardBrand || null;
    const funding = resp?.funding || resp?.cardType || null;
    const country = (resp?.country || resp?.countryCode || resp?.issuerCountry || '').toString().toLowerCase();
    const currency = resp?.currency || 'brl';
    const issuer = resp?.issuer || resp?.bank || null;

    const insights: BINInsights = {
      id: resp?.id || 'bin_lookup',
      fingerprint: resp?.paymentAccountReference || resp?.par || 'unknown',
      metadata: {
        brand: brand || 'unknown',
        funding: funding || 'unknown',
        segment: resp?.segment || 'unknown',
        country: country || 'br',
        currency: currency || 'brl',
        issuer: issuer || 'unknown',
        lastFour: String(pan).slice(-4),
      },
    };
    return insights;
  }

  // ──────────────────────────────────────────────────────
  // Register Card (vault) - PRO only
  // ──────────────────────────────────────────────────────
  async registerCard(input: {
    token: string;
    expiry: { month: string; year: string };
    merchantId: string;
    customerId: string;
  }): Promise<RegisteredCard> {
    // Criar card no Evervault
    const evCard = await this.evervault.createCard({
      number: input.token,
      expiry: input.expiry,
    });

    // Meter operação
    const pricing = this.metering.getUnitCost('card.create');
    await this.metering.record({
      merchantId: input.merchantId,
      customerId: input.customerId,
      operation: 'card.create',
      evervaultCost: pricing.evervaultCost,
      krxPrice: pricing.krxPrice,
      metadata: { evervaultCardId: evCard.evervaultCardId },
    });

    // Salvar no vault (dedup por fingerprint)
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO vault_cards (
          id, merchant_id, customer_id,
          evervault_card_id, brand, last4, exp_month, exp_year,
          fingerprint, status, is_default, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2,
          $3, $4, $5, $6, $7,
          $8, 'active', false, NOW(), NOW()
        )
        ON CONFLICT (evervault_card_id) DO UPDATE SET
          updated_at = NOW()`,
        input.merchantId,
        input.customerId,
        evCard.evervaultCardId,
        evCard.brand,
        evCard.last4,
        parseInt(evCard.expiry.month),
        parseInt(evCard.expiry.year),
        evCard.fingerprint
      );
    } catch (error) {
      console.error('[KRXSecure] Failed to save card to vault:', error);
    }

    return evCard;
  }

  // ──────────────────────────────────────────────────────
  // Ensure Network Token - PRO only
  // ──────────────────────────────────────────────────────
  async ensureNetworkToken(input: {
    evervaultCardId: string;
    merchantEvervaultId: string;
    merchantId: string;
  }): Promise<NetworkTokenResult> {
    // Check cache primeiro
    const cached = await this.getCachedNetworkToken(
      input.evervaultCardId,
      input.merchantEvervaultId
    );

    if (cached && cached.status === 'active') {
      return {
        networkTokenId: cached.networkTokenId!,
        dpan: cached.networkTokenNumber!,
        expiry: {
          month: String(cached.expMonth).padStart(2, '0'),
          year: String(cached.expYear),
        },
        par: cached.fingerprint,
      };
    }

    // Criar novo network token
    const evCard = await this.evervault.getCard(input.evervaultCardId);

    const networkToken = await this.evervault.createNetworkToken({
      card: {
        number: evCard.number,
        expiry: evCard.expiry,
      },
      merchant: input.merchantEvervaultId,
    });

    // Meter operação
    const pricing = this.metering.getUnitCost('network-token.create');
    await this.metering.record({
      merchantId: input.merchantId,
      operation: 'network-token.create',
      evervaultCost: pricing.evervaultCost,
      krxPrice: pricing.krxPrice,
      metadata: {
        evervaultCardId: input.evervaultCardId,
        networkTokenId: networkToken.networkTokenId,
      },
    });

    // Cache no vault
    await this.cacheNetworkToken(input.evervaultCardId, networkToken);

    return networkToken;
  }

  // ──────────────────────────────────────────────────────
  // Create Cryptogram - PRO only
  // ──────────────────────────────────────────────────────
  async createCryptogram(input: {
    networkTokenId: string;
    merchantId: string;
  }): Promise<CryptogramResult> {
    const cryptogram = await this.evervault.createCryptogram(input.networkTokenId);

    // Meter operação
    const pricing = this.metering.getUnitCost('cryptogram.create');
    await this.metering.record({
      merchantId: input.merchantId,
      operation: 'cryptogram.create',
      evervaultCost: pricing.evervaultCost,
      krxPrice: pricing.krxPrice,
      metadata: { networkTokenId: input.networkTokenId },
    });

    return cryptogram;
  }

  // ──────────────────────────────────────────────────────
  // 3DS Session - PRO only
  // ──────────────────────────────────────────────────────
  async create3DSSession(input: {
    card: { number: string; expiry: { month: string; year: string } };
    amount: number;
    currency: string;
    merchantId: string;
  }): Promise<ThreeDSSessionResult> {
    // Buscar merchant info para 3DS
    const merchant = await prisma.merchant.findUnique({
      where: { id: input.merchantId },
      select: {
        clinic: {
          select: { name: true, website: true },
        },
      },
    });

    const session = await this.evervault.create3DSSession({
      merchant: {
        name: merchant?.clinic?.name || 'Merchant',
        website: merchant?.clinic?.website || 'https://example.com',
        categoryCode: '5945', // Default MCC
        country: 'BR',
      },
      card: input.card,
      payment: {
        type: 'one-off',
        amount: input.amount,
        currency: input.currency,
      },
    });

    // Meter operação
    const pricing = this.metering.getUnitCost('3ds-session.create');
    await this.metering.record({
      merchantId: input.merchantId,
      operation: '3ds-session.create',
      evervaultCost: pricing.evervaultCost,
      krxPrice: pricing.krxPrice,
      metadata: { sessionId: session.sessionId },
    });

    return session;
  }

  // ──────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────
  private async getCachedNetworkToken(
    evervaultCardId: string,
    merchantEvervaultId: string
  ): Promise<any> {
    const result = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM vault_cards
       WHERE evervault_card_id = $1
         AND network_token_id IS NOT NULL
         AND status = 'active'
       LIMIT 1`,
      evervaultCardId
    );
    return result?.[0] || null;
  }

  private async cacheNetworkToken(
    evervaultCardId: string,
    networkToken: NetworkTokenResult
  ): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE vault_cards
         SET network_token_id = $2,
             network_token_number = $3,
             exp_month = $4,
             exp_year = $5,
             updated_at = NOW()
         WHERE evervault_card_id = $1`,
        evervaultCardId,
        networkToken.networkTokenId,
        networkToken.dpan,
        parseInt(networkToken.expiry.month),
        parseInt(networkToken.expiry.year)
      );
    } catch (error) {
      console.error('[KRXSecure] Failed to cache network token:', error);
    }
  }
}
