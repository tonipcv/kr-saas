import crypto from 'crypto';

function b64urlToBuffer(input: string): Buffer {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = input.length % 4;
  if (pad) input += '='.repeat(4 - pad);
  return Buffer.from(input, 'base64');
}

export function decodeJwt(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
  const payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  const signature = b64urlToBuffer(parts[2]);
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  return { header, payload, signature, signingInput } as const;
}

async function tryFetchJwks(jwksUri: string): Promise<any> {
  const res = await fetch(jwksUri, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const ctype = res.headers.get('content-type') || '';
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok || !/json/i.test(ctype) || !json) {
    const snippet = text ? text.slice(0, 180) : '';
    const err: any = new Error(`JWKS fetch failed (${res.status}) at ${jwksUri}: ${snippet}`);
    err.status = res.status; err.text = snippet; err.url = jwksUri;
    throw err;
  }
  return json;
}

export async function fetchJwks(jwksUri: string): Promise<any> {
  return tryFetchJwks(jwksUri);
}

async function getJwksFromIssuer(issuer: string): Promise<any> {
  const wellKnown = issuer.replace(/\/$/, '') + '/.well-known/jwks.json';
  try { return await tryFetchJwks(wellKnown); } catch (e) {
    const alt = issuer.replace(/\/$/, '') + '/protocol/openid-connect/certs';
    return await tryFetchJwks(alt);
  }
}

function jwkToPublicKey(jwk: any): crypto.KeyObject {
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) throw new Error('Unsupported JWK');
  const n = Buffer.from(jwk.n.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const e = Buffer.from(jwk.e.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  // Build simple SubjectPublicKeyInfo DER for RSA from modulus and exponent
  // Easier: use Node's createPublicKey with JWK directly (Node v16.14+ supports jwk)
  try {
    return crypto.createPublicKey({ key: jwk, format: 'jwk' as any });
  } catch {
    // Fallback not implemented; require Node supporting JWK
    throw new Error('Failed to import JWK');
  }
}

export function verifyPS256(signingInput: Buffer, signature: Buffer, publicKey: crypto.KeyObject): boolean {
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(signingInput);
  verify.end();
  return verify.verify({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, signature);
}

export async function validateIdToken(idToken: string, opts: {
  jwksUri?: string,
  expectedIssuer?: string,
  expectedAudience?: string,
  expectedNonce?: string,
}): Promise<{ header: any, payload: any }>
{
  const { header, payload, signature, signingInput } = decodeJwt(idToken);
  if (header.alg !== 'PS256') throw new Error(`Unsupported alg ${header.alg}`);
  const issuer = opts.expectedIssuer || payload.iss;
  let jwks: any;
  if (opts.jwksUri) {
    try { jwks = await fetchJwks(opts.jwksUri); } catch (e) {
      // Fallback to issuer-based discovery if provided URI fails
      if (issuer) {
        jwks = await getJwksFromIssuer(issuer);
      } else {
        throw e;
      }
    }
  } else if (issuer) {
    jwks = await getJwksFromIssuer(issuer);
  } else {
    throw new Error('No JWKS source available (missing jwksUri and issuer)');
  }
  const key = (jwks.keys || []).find((k: any) => k.kid === header.kid);
  if (!key) throw new Error('JWK not found for kid');
  const pub = jwkToPublicKey(key);
  const ok = verifyPS256(signingInput, signature, pub);
  if (!ok) throw new Error('Invalid id_token signature');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) throw new Error('id_token expired');
  if (typeof payload.iat === 'number' && payload.iat > now + 300) throw new Error('id_token iat in future');
  if (opts.expectedIssuer && payload.iss !== opts.expectedIssuer) throw new Error('Invalid iss');
  if (opts.expectedAudience && payload.aud !== opts.expectedAudience) throw new Error('Invalid aud');
  if (opts.expectedNonce && payload.nonce && payload.nonce !== opts.expectedNonce) throw new Error('Invalid nonce');
  return { header, payload };
}
