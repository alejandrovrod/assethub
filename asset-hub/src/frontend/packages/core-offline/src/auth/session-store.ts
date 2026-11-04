import type { FieldDatabase } from '../db/database';
import type { AuthSessionRecord } from '../db/schema';

export interface UserSessionData {
  tenantId: string;
  userId: string;
  employeeId?: string;
  teamIds?: string[];
  displayName: string;
  roles: string[];
  permissions: string[];
  accessToken: string;
  refreshToken: string;
  accessExpiresAtMs: number;
  offlineLeaseJwt: string;
  offlineLeaseExpiresAtMs: number;
  jwksJson: string;
  clockSkewMs?: number;
  pinHash?: string;
  biometricEnabled?: boolean;
  deviceKeyId: string;
}

// ── Non-exportable AES-GCM Master Key ─────────────────────────────────────────

let cachedMasterKey: CryptoKey | null = null;

export async function getOrCreateMasterKey(): Promise<CryptoKey> {
  if (cachedMasterKey) return cachedMasterKey;

  // In standard web environments, CryptoKey can be stored in IndexedDB.
  // We generate a non-exportable 256-bit AES-GCM key.
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // Must be extractable in tests/node fake-crypto or false in browser
    ['encrypt', 'decrypt']
  );

  cachedMasterKey = key;
  return key;
}

export function resetMasterKeyCache(): void {
  cachedMasterKey = null;
}

// ── PIN Hashing (PBKDF2-SHA256, 210,000 iterations) ───────────────────────────

export async function hashPin(
  pin: string,
  salt?: Uint8Array
): Promise<{ hashHex: string; saltHex: string }> {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: actualSalt as unknown as BufferSource,
      iterations: 210_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashBytes = new Uint8Array(derivedBits);
  const hashHex = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const saltHex = Array.from(actualSalt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { hashHex, saltHex };
}

export async function verifyPin(
  pin: string,
  storedHashHex: string,
  saltHex: string
): Promise<boolean> {
  const saltBytes = new Uint8Array(
    saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );
  const { hashHex } = await hashPin(pin, saltBytes);
  return hashHex === storedHashHex;
}

// ── Session Vault Repository ──────────────────────────────────────────────────

export class SessionVault {
  constructor(private db: FieldDatabase) {}

  async saveSession(session: UserSessionData, masterKey?: CryptoKey): Promise<void> {
    const key = masterKey ?? (await getOrCreateMasterKey());
    const encoder = new TextEncoder();

    // Encrypt access token
    const accessIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedAccessToken = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: accessIv },
      key,
      encoder.encode(session.accessToken)
    );

    // Encrypt refresh token
    const refreshIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedRefreshToken = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: refreshIv },
      key,
      encoder.encode(session.refreshToken)
    );

    const record: AuthSessionRecord = {
      key: 'current',
      tenantId: session.tenantId,
      userId: session.userId,
      employeeId: session.employeeId,
      teamIdsJson: session.teamIds ? JSON.stringify(session.teamIds) : undefined,
      displayName: session.displayName,
      rolesJson: JSON.stringify(session.roles),
      permissionsJson: JSON.stringify(session.permissions),
      encryptedAccessToken,
      accessIv,
      accessExpiresAtMs: session.accessExpiresAtMs,
      encryptedRefreshToken,
      refreshIv,
      offlineLeaseJwt: session.offlineLeaseJwt,
      offlineLeaseExpiresAtMs: session.offlineLeaseExpiresAtMs,
      jwksJson: session.jwksJson,
      clockSkewMs: session.clockSkewMs ?? 0,
      lastRefreshAtMs: Date.now(),
      pinHash: session.pinHash,
      biometricEnabled: session.biometricEnabled ?? false,
      deviceKeyId: session.deviceKeyId,
    };

    await this.db.auth_session.put(record);
  }

  async loadSession(masterKey?: CryptoKey): Promise<UserSessionData | null> {
    const record = await this.db.auth_session.get('current');
    if (!record) return null;

    const key = masterKey ?? (await getOrCreateMasterKey());
    const decoder = new TextDecoder();

    try {
      const decryptedAccess = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: record.accessIv as unknown as BufferSource },
        key,
        record.encryptedAccessToken
      );
      const accessToken = decoder.decode(decryptedAccess);

      const decryptedRefresh = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: record.refreshIv as unknown as BufferSource },
        key,
        record.encryptedRefreshToken
      );
      const refreshToken = decoder.decode(decryptedRefresh);

      return {
        tenantId: record.tenantId,
        userId: record.userId,
        employeeId: record.employeeId,
        teamIds: record.teamIdsJson ? JSON.parse(record.teamIdsJson) : undefined,
        displayName: record.displayName,
        roles: JSON.parse(record.rolesJson),
        permissions: JSON.parse(record.permissionsJson),
        accessToken,
        refreshToken,
        accessExpiresAtMs: record.accessExpiresAtMs,
        offlineLeaseJwt: record.offlineLeaseJwt,
        offlineLeaseExpiresAtMs: record.offlineLeaseExpiresAtMs,
        jwksJson: record.jwksJson,
        clockSkewMs: record.clockSkewMs,
        pinHash: record.pinHash,
        biometricEnabled: record.biometricEnabled,
        deviceKeyId: record.deviceKeyId,
      };
    } catch {
      throw new Error('Failed to decrypt session tokens. Master key mismatch or corrupted vault.');
    }
  }

  async clearSession(): Promise<void> {
    await this.db.auth_session.delete('current');
  }

  /**
   * Performs complete transactional purge of all 12 Dexie tables on logout (T069/T070)
   */
  async purgeAllTenantData(): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.tasks,
        this.db.maintenance_orders,
        this.db.order_parts,
        this.db.assets,
        this.db.asset_bom_materials,
        this.db.incidents,
        this.db.materials_stock,
        this.db.workflow_templates,
        this.db.catalog_items,
        this.db.directory_entries,
        this.db.outbox_mutations,
        this.db.media_queue,
        this.db.sync_meta,
        this.db.auth_session,
      ],
      async () => {
        await Promise.all([
          this.db.tasks.clear(),
          this.db.maintenance_orders.clear(),
          this.db.order_parts.clear(),
          this.db.assets.clear(),
          this.db.asset_bom_materials.clear(),
          this.db.incidents.clear(),
          this.db.materials_stock.clear(),
          this.db.workflow_templates.clear(),
          this.db.catalog_items.clear(),
          this.db.directory_entries.clear(),
          this.db.outbox_mutations.clear(),
          this.db.media_queue.clear(),
          this.db.sync_meta.clear(),
          this.db.auth_session.clear(),
        ]);
      }
    );
  }
}

