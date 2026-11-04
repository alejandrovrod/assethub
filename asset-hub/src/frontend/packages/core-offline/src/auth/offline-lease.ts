export interface OfflineLeaseClaims {
  iss: string;
  sub: string;
  tid: string;
  typ: 'offline_lease';
  scope: string;
  device_id: string;
  iat: number;
  exp: number;
  jti: string;
  employee_id?: string;
  teams?: string[];
}

export interface JwksKey {
  kty: string;
  use?: string;
  alg?: string;
  kid: string;
  n: string;
  e: string;
}

export interface Jwks {
  keys: JwksKey[];
}

// ── Base64url helpers ─────────────────────────────────────────────────────────

export function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function parseJwt(token: string): {
  header: { alg: string; kid?: string; typ?: string };
  payload: OfflineLeaseClaims;
  signedData: Uint8Array;
  signature: Uint8Array;
} {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const header = JSON.parse(decoder.decode(base64urlDecode(parts[0])));
  const payload = JSON.parse(decoder.decode(base64urlDecode(parts[1]))) as OfflineLeaseClaims;
  const signature = base64urlDecode(parts[2]);
  const signedData = encoder.encode(`${parts[0]}.${parts[1]}`);

  return { header, payload, signedData, signature };
}

// ── RSA Key import & verification ─────────────────────────────────────────────

export async function importRsaPublicKey(jwk: JwksKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg ?? 'RS256',
      use: jwk.use ?? 'sig',
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export interface ValidateLeaseOptions {
  token: string;
  jwks: Jwks;
  expectedTenantId: string;
  expectedDeviceId: string;
  nowMs?: number;
}

export async function validateOfflineLease(
  opts: ValidateLeaseOptions
): Promise<OfflineLeaseClaims> {
  const { token, jwks, expectedTenantId, expectedDeviceId, nowMs = Date.now() } = opts;

  const { header, payload, signedData, signature } = parseJwt(token);

  // 1. Claim checks
  if (payload.typ !== 'offline_lease') {
    throw new Error(`Invalid token type: expected 'offline_lease', got '${payload.typ}'`);
  }

  if (payload.tid !== expectedTenantId) {
    throw new Error(`Tenant mismatch: expected '${expectedTenantId}', got '${payload.tid}'`);
  }

  if (payload.device_id !== expectedDeviceId) {
    throw new Error(`Device mismatch: expected '${expectedDeviceId}', got '${payload.device_id}'`);
  }

  if (payload.exp * 1000 <= nowMs) {
    throw new Error(`Offline lease expired at ${new Date(payload.exp * 1000).toISOString()}`);
  }

  // 2. JWKS Key matching
  const keyMatch = header.kid
    ? jwks.keys.find((k) => k.kid === header.kid)
    : jwks.keys[0];

  if (!keyMatch) {
    throw new Error(`No matching JWKS key found for kid '${header.kid}'`);
  }

  // 3. Signature verification
  const cryptoKey = await importRsaPublicKey(keyMatch);
  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signature as unknown as BufferSource,
    signedData as unknown as BufferSource
  );

  if (!isValid) {
    throw new Error('Offline lease signature verification failed');
  }

  return payload;
}

