import crypto from 'crypto';

const KEY_B64 = process.env.FIELD_ENCRYPTION_KEY || '';

function getKey(): Buffer {
  if (!KEY_B64) throw new Error('FIELD_ENCRYPTION_KEY is not set');
  const key = Buffer.from(KEY_B64, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be a 32-byte base64 value');
  return key;
}

export function encryptSecret(plainText: string): { iv: string; cipherText: string } {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([enc, tag]);
  return {
    iv: iv.toString('base64'),
    cipherText: payload.toString('base64'),
  };
}

export function decryptSecret(ivB64: string, cipherTextB64: string): string {
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const payload = Buffer.from(cipherTextB64, 'base64');
  const enc = payload.slice(0, payload.length - 16);
  const tag = payload.slice(payload.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}
