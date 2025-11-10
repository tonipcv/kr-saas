/**
 * Converte base64url para ArrayBuffer
 */
export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converte ArrayBuffer para base64url
 */
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  const base64 = (typeof btoa !== 'undefined' ? btoa(binaryString) : Buffer.from(binaryString, 'binary').toString('base64'));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Solicita assinatura WebAuthn para pagamento
 */
export async function getPaymentAssertion(publicKey: any) {
  const pk = { ...(publicKey || {}) };
  if (typeof pk.challenge === 'string') pk.challenge = base64UrlToBuffer(pk.challenge);
  if (Array.isArray(pk.allowCredentials)) {
    pk.allowCredentials = pk.allowCredentials.map((cred: any) => ({
      type: 'public-key',
      id: typeof cred.id === 'string' ? base64UrlToBuffer(cred.id) : cred.id,
      transports: cred.transports,
    }));
  }
  const credential = await (navigator as any).credentials.get({ publicKey: pk });
  if (!credential) throw new Error('Autorização cancelada pelo usuário');

  const response = (credential as any).response as AuthenticatorAssertionResponse;
  return {
    id: (credential as any).id,
    rawId: bufferToBase64Url((credential as any).rawId),
    response: {
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
    },
    type: (credential as any).type || 'public-key',
    clientExtensionResults: (credential as any).getClientExtensionResults?.() || {},
    authenticatorAttachment: (credential as any).authenticatorAttachment || 'platform',
  };
}
