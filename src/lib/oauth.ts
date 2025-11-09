import crypto from 'crypto';

export function randomBase64Url(bytes = 32) {
  const b = crypto.randomBytes(bytes);
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function sha256Base64Url(input: string) {
  const hash = crypto.createHash('sha256').update(input).digest('base64');
  return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createPkce() {
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = sha256Base64Url(codeVerifier);
  return { codeVerifier, codeChallenge, method: 'S256' as const };
}

export function buildQuery(params: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.length > 0) usp.append(k, v);
  }
  return usp.toString();
}
