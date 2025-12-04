// KRX Secure Types (Evervault wrapper)

export type BINInsights = {
  id: string;
  fingerprint: string;
  metadata: {
    brand: string;
    funding: string;
    segment: string;
    country: string;
    currency: string;
    issuer: string;
    lastFour: string;
  };
};

export type RegisteredCard = {
  evervaultCardId: string;
  brand: string;
  last4: string;
  expiry: { month: string; year: string };
  fingerprint: string; // PAR
};

export type NetworkTokenResult = {
  networkTokenId: string;
  dpan: string; // network token number
  expiry: { month: string; year: string };
  par: string;
};

export type CryptogramResult = {
  cryptogram: string;
  eci?: string;
};

export type ThreeDSSessionResult = {
  sessionId: string;
  status: string;
  nextAction?: any;
  cryptogram?: string;
  eci?: string;
};

export type KRXSecureOperation =
  | 'inspect'
  | 'card.create'
  | 'network-token.create'
  | 'cryptogram.create'
  | '3ds-session.create'
  | '3ds-session.get'
  | 'insights.full';

export class KRXSecureFeatureNotAvailableError extends Error {
  constructor(
    public feature: string,
    public currentPlan: string,
    public requiredPlan: string
  ) {
    super(`Feature '${feature}' requires ${requiredPlan} plan (current: ${currentPlan})`);
    this.name = 'KRXSecureFeatureNotAvailableError';
  }
}
