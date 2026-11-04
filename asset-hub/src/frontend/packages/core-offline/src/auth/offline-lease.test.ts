import { describe, it, expect, beforeAll } from 'vitest';
import {
  validateOfflineLease,
  type Jwks,
  type OfflineLeaseClaims,
} from './offline-lease';

describe('offline-lease validation (T065)', () => {
  let publicKeyJwk: any;
  let privateKey: CryptoKey;
  const kid = 'test-rsa-key-1';

  beforeAll(async () => {
    // Generate RSA Key pair for testing signature verification
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );

    privateKey = keyPair.privateKey;
    publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    publicKeyJwk.kid = kid;
    publicKeyJwk.alg = 'RS256';
    publicKeyJwk.use = 'sig';
  });

  async function createSignedToken(claims: Partial<OfflineLeaseClaims>, headerKid: string = kid): Promise<string> {
    const encoder = new TextEncoder();
    const b64Url = (obj: any) =>
      btoa(JSON.stringify(obj))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const header = { alg: 'RS256', typ: 'JWT', kid: headerKid };
    const payload: OfflineLeaseClaims = {
      iss: 'https://assethub.local',
      sub: 'user-42',
      tid: 'tenant-acme',
      typ: 'offline_lease',
      scope: 'tasks:write incidents:write',
      device_id: 'device-abc',
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 3600 * 8, // 8h
      jti: 'token-uuid-1',
      employee_id: 'emp-42',
      teams: ['team-alpha'],
      ...claims,
    };

    const encodedHeader = b64Url(header);
    const encodedPayload = b64Url(payload);
    const dataToSign = encoder.encode(`${encodedHeader}.${encodedPayload}`);

    const signatureBytes = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      dataToSign
    );

    const binarySig = String.fromCharCode(...new Uint8Array(signatureBytes));
    const encodedSig = btoa(binarySig)
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${encodedHeader}.${encodedPayload}.${encodedSig}`;
  }

  it('validates a properly signed offline lease against JWKS', async () => {
    const jwks: Jwks = { keys: [publicKeyJwk] };
    const token = await createSignedToken({});

    const claims = await validateOfflineLease({
      token,
      jwks,
      expectedTenantId: 'tenant-acme',
      expectedDeviceId: 'device-abc',
    });

    expect(claims.sub).toBe('user-42');
    expect(claims.tid).toBe('tenant-acme');
    expect(claims.employee_id).toBe('emp-42');
    expect(claims.teams).toEqual(['team-alpha']);
  });

  it('rejects an expired lease token', async () => {
    const jwks: Jwks = { keys: [publicKeyJwk] };
    const expiredToken = await createSignedToken({
      exp: Math.floor(Date.now() / 1000) - 100, // expired 100s ago
    });

    await expect(
      validateOfflineLease({
        token: expiredToken,
        jwks,
        expectedTenantId: 'tenant-acme',
        expectedDeviceId: 'device-abc',
      })
    ).rejects.toThrow(/Offline lease expired/);
  });

  it('rejects token with tenant or device mismatch', async () => {
    const jwks: Jwks = { keys: [publicKeyJwk] };
    const token = await createSignedToken({});

    await expect(
      validateOfflineLease({
        token,
        jwks,
        expectedTenantId: 'wrong-tenant',
        expectedDeviceId: 'device-abc',
      })
    ).rejects.toThrow(/Tenant mismatch/);

    await expect(
      validateOfflineLease({
        token,
        jwks,
        expectedTenantId: 'tenant-acme',
        expectedDeviceId: 'wrong-device',
      })
    ).rejects.toThrow(/Device mismatch/);
  });

  it('rejects tampered signature', async () => {
    const jwks: Jwks = { keys: [publicKeyJwk] };
    const token = await createSignedToken({});
    const parts = token.split('.');
    // Corrupt one character in the signature
    const corruptedSig = parts[2].slice(0, -2) + 'AA';
    const tamperedToken = `${parts[0]}.${parts[1]}.${corruptedSig}`;

    await expect(
      validateOfflineLease({
        token: tamperedToken,
        jwks,
        expectedTenantId: 'tenant-acme',
        expectedDeviceId: 'device-abc',
      })
    ).rejects.toThrow(/signature verification failed/);
  });
});

