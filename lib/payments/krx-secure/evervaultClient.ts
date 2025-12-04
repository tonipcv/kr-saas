// Evervault API Client (HTTP Basic Auth wrapper)

import type {
  BINInsights,
  RegisteredCard,
  NetworkTokenResult,
  CryptogramResult,
  ThreeDSSessionResult,
} from './types';

export type EvervaultConfig = {
  appId: string;
  apiKey: string;
  baseUrl?: string;
};

export class EvervaultClient {
  private appId: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: EvervaultConfig) {
    this.appId = config.appId;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.evervault.com';
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.appId}:${this.apiKey}`).toString('base64');
    return `Basic ${credentials}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Evervault API error: ${response.status} - ${error.title || error.detail || 'Unknown error'}`
      );
    }

    return response.json();
  }

  // ──────────────────────────────────────────────────────
  // Inspect (BIN lookup)
  // ──────────────────────────────────────────────────────
  async inspect(token: string): Promise<BINInsights> {
    return this.request<BINInsights>('POST', '/inspect', { token });
  }

  // ──────────────────────────────────────────────────────
  // Card Account Updater
  // ──────────────────────────────────────────────────────
  async createCard(input: {
    number: string; // token Evervault
    expiry: { month: string; year: string };
  }): Promise<RegisteredCard> {
    const response = await this.request<any>('POST', '/payments/cards', input);
    return {
      evervaultCardId: response.id,
      brand: response.brand,
      last4: response.lastFour,
      expiry: response.expiry,
      fingerprint: response.paymentAccountReference,
    };
  }

  async getCard(cardId: string): Promise<any> {
    return this.request('GET', `/payments/cards/${cardId}`, undefined);
  }

  async deleteCard(cardId: string): Promise<void> {
    await this.request('DELETE', `/payments/cards/${cardId}`, undefined);
  }

  // ──────────────────────────────────────────────────────
  // Network Tokens
  // ──────────────────────────────────────────────────────
  async createNetworkToken(input: {
    card: {
      number: string; // token Evervault
      expiry: { month: string; year: string };
      cvc?: string;
    };
    merchant: string; // merchant Evervault ID
  }): Promise<NetworkTokenResult> {
    const response = await this.request<any>('POST', '/payments/network-tokens', input);
    return {
      networkTokenId: response.id,
      dpan: response.number,
      expiry: response.expiry,
      par: response.paymentAccountReference,
    };
  }

  async getNetworkToken(tokenId: string): Promise<any> {
    return this.request('GET', `/payments/network-tokens/${tokenId}`, undefined);
  }

  async createCryptogram(tokenId: string): Promise<CryptogramResult> {
    const response = await this.request<any>(
      'POST',
      `/payments/network-tokens/${tokenId}/cryptograms`,
      {}
    );
    return {
      cryptogram: response.cryptogram,
      eci: response.eci,
    };
  }

  // ──────────────────────────────────────────────────────
  // 3D Secure
  // ──────────────────────────────────────────────────────
  async create3DSSession(input: {
    merchant: {
      name: string;
      website: string;
      categoryCode: string;
      country: string;
    };
    card: {
      number: string;
      expiry: { month: string; year: string };
    };
    acquirer?: string;
    payment: {
      type: string;
      amount: number;
      currency: string;
    };
    customer?: any;
    challenge?: any;
    initiator?: any;
    preferredVersions?: string[];
  }): Promise<ThreeDSSessionResult> {
    const response = await this.request<any>('POST', '/payments/3ds-sessions', input);
    return {
      sessionId: response.id,
      status: response.status,
      nextAction: response.nextAction,
      cryptogram: response.cryptogram,
      eci: response.eci,
    };
  }

  async get3DSSession(sessionId: string): Promise<ThreeDSSessionResult> {
    const response = await this.request<any>(
      'GET',
      `/payments/3ds-sessions/${sessionId}`,
      undefined
    );
    return {
      sessionId: response.id,
      status: response.status,
      nextAction: response.nextAction,
      cryptogram: response.cryptogram,
      eci: response.eci,
    };
  }

  // ──────────────────────────────────────────────────────
  // Card Insights (AVS, CVV, fees, capabilities)
  // ──────────────────────────────────────────────────────
  async getCardInsights(input: {
    card: {
      number: string;
      expiry: { month: string; year: string };
      cvv?: string;
    };
    extensions: string[];
    transaction?: {
      amount: number;
      currency: string;
    };
    cardholder?: {
      firstName: string;
      lastName: string;
    };
    address?: {
      postalCode: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      country: string;
    };
  }): Promise<any> {
    return this.request('POST', '/insights/cards', input);
  }

  // ──────────────────────────────────────────────────────
  // BIN Lookup
  // ──────────────────────────────────────────────────────
  async binLookup(number: string): Promise<any> {
    return this.request('POST', '/payments/bin-lookups', { number });
  }
}
