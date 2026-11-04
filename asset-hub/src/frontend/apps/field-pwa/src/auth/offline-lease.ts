// offline-lease.ts — JWKS-based JWT validation for offline lease
// Validates signature, exp, tid, device_id without network calls.

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
}

export interface JwksKey {
  kty: string;
  use: string;
  alg: string;
  kid: string;
  n: string;
  e: string;
}

export interface Jwks {
  keys: JwksKey[];
}

// ── Base64url helpers ─────────────────────────────────────────────────────────

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── JWT parsing ───────────────────────────────────────────────────────────────

export function parseJwt(token: string): { header: Record<string, unknown>; payload: OfflineLeaseClaims; signature: Uint8Array } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1]))) as OfflineLeaseClaims;
  const signature = base64urlDecode(parts[2]);

  return { header, payload, signature };
}

// ── RSA public key import from JWKS ───────────────────────────────────────────

async function importRsaKey(jwk: JwksKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg,
      use: jwk.use,
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

// ── JWKS cache (in-memory + localStorage) ─────────────────────────────────────

const JWKS_CACHE_KEY = 'field-pwa-jwks-cache';
const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function getCachedJwks(): Jwks | null {
  try {
    const raw = localStorage.getItem(JWKS_CACHE_KEY);
    if (!raw) return null;
    const { jwks, cachedAt } = JSON.parse(raw);
    if (Date.now() - cachedAt > JWKS_CACHE_TTL_MS) return null;
    return jwks as Jwks;
  } catch {
    return null;
  }
}

export function cacheJwks(jwks: Jwks): void {
  try {
    localStorage.setItem(JWKS_CACHE_KEY, JSON.stringify({ jwks, cachedAt: Date.now() }));
  } catch {
    // Ignore storage errors
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

export async function validateOfflineLease(
  token: string,
  expectedTenantId: string,
  expectedDeviceId: string,
  jwks: Jwks,
): Promise<OfflineLeaseClaims> {
  const { header, payload, signature } = parseJwt(token);

  // Verify typ
  if (payload.typ !== 'offline_lease') {
    throw new Error('Invalid lease type: expected offline_lease');
  }

  // Verify iss
  if (payload.iss !== 'assethub') {
    throw new Error('Invalid issuer');
  }

  // Verify tid matches
  if (payload.tid !== expectedTenantId) {
    throw new Error('Tenant mismatch');
  }

  // Verify device_id matches
  if (payload.device_id !== expectedDeviceId) {
    throw new Error('Device mismatch');
  }

  // Verify scope
  if (payload.scope !== 'field:offline') {
    throw new Error('Invalid scope');
  }

  // Verify exp
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Lease expired');
  }

  // Verify iat is not in the future (with 5 min tolerance)
  if (payload.iat > now + 300) {
    throw new Error('Lease issued in the future');
  }

  // Find the key by kid
  const kid = header.kid as string;
  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) {
    throw new Error(`Key not found: ${kid}`);
  }

  // Import and verify signature
  const key = await importRsaKey(jwk);
  const data = new TextEncoder().encode(token.split('.').slice(0, 2).join('.'));
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature.buffer as ArrayBuffer,
    data,
  );

  if (!valid) {
    throw new Error('Invalid signature');
  }

  return payload;
}

