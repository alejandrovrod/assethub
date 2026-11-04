import { describe, it, expect, beforeEach } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import {
  SessionVault,
  hashPin,
  verifyPin,
  type UserSessionData,
} from './session-store';

describe('SessionVault and PIN Hashing (T063 / T064)', () => {
  let db: FieldDatabase;
  let vault: SessionVault;

  beforeEach(() => {
    db = createFieldDatabase(`test-vault-${Date.now()}-${Math.random()}`);
    vault = new SessionVault(db);
  });

  const sampleSession: UserSessionData = {
    tenantId: 'tenant-acme',
    userId: 'user-001',
    employeeId: 'emp-101',
    teamIds: ['team-maintenance', 'team-north'],
    displayName: 'Carlos Gonzalez',
    roles: ['technician'],
    permissions: ['tasks:read', 'tasks:write', 'incidents:write'],
    accessToken: 'secret-jwt-access-token-xyz',
    refreshToken: 'secret-refresh-token-abc',
    accessExpiresAtMs: Date.now() + 900_000,
    offlineLeaseJwt: 'offline.lease.jwt',
    offlineLeaseExpiresAtMs: Date.now() + 8 * 3600_000,
    jwksJson: JSON.stringify({ keys: [] }),
    deviceKeyId: 'device-uuid-123',
  };

  it('encrypts access and refresh tokens so plaintext does not appear in IndexedDB', async () => {
    await vault.saveSession(sampleSession);

    // Read directly from Dexie table to inspect stored bytes
    const stored = await db.auth_session.get('current');
    expect(stored).toBeDefined();

    // Verify raw ArrayBuffer does not equal plaintext
    const accessBytes = new Uint8Array(stored!.encryptedAccessToken);
    const decoder = new TextDecoder();
    const decoded = decoder.decode(accessBytes);

    expect(decoded).not.toContain('secret-jwt-access-token-xyz');
    expect(decoded).not.toContain('secret-refresh-token-abc');

    // Load through vault decrypts correctly
    const loaded = await vault.loadSession();
    expect(loaded?.accessToken).toBe('secret-jwt-access-token-xyz');
    expect(loaded?.refreshToken).toBe('secret-refresh-token-abc');
    expect(loaded?.employeeId).toBe('emp-101');
    expect(loaded?.teamIds).toEqual(['team-maintenance', 'team-north']);
  });

  it('fails to decrypt if an incorrect or different master key is provided', async () => {
    const wrongKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    await vault.saveSession(sampleSession);

    // Attempting to load with the wrong key must throw
    await expect(vault.loadSession(wrongKey)).rejects.toThrow(
      /Failed to decrypt session tokens/
    );
  });

  it('hashes PIN with PBKDF2 210k iterations and verifies correctly', async () => {
    const { hashHex, saltHex } = await hashPin('1234');
    expect(hashHex).toHaveLength(64); // 256 bits = 64 hex chars
    expect(saltHex).toHaveLength(32); // 16 bytes = 32 hex chars

    const isValid = await verifyPin('1234', hashHex, saltHex);
    expect(isValid).toBe(true);

    const isWrong = await verifyPin('9999', hashHex, saltHex);
    expect(isWrong).toBe(false);
  });
});

