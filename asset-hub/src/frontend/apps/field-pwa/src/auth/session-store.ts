// session-store.ts — AES-GCM encrypted session storage with non-exportable CryptoKey
// Stores access/refresh tokens encrypted in IndexedDB, never in plaintext.

const DB_NAME = 'field-pwa-session';
const STORE_NAME = 'session';
const KEY_STORE = 'crypto-key';

export interface SessionData {
  accessToken: string;
  refreshToken: string;
  tenantSlug: string | null;
  tenantName: string | null;
  roles: string[];
  permissions: string[];
  userId: string;
  userName?: string;
  userEmail?: string;
  employeeId?: string;
  employeeName?: string;
  roleLabel?: string;
  teamIds?: string[];
  expiresAt: number;
}

export interface StoredSession {
  encrypted: ArrayBuffer;
  iv: Uint8Array;
  pinHash?: string;
}

// ── CryptoKey management (non-exportable) ──────────────────────────────────────

async function getOrCreateKey(): Promise<CryptoKey> {
  // Try to retrieve existing key from IndexedDB
  const db = await openKeyDb();
  const tx = db.transaction(KEY_STORE, 'readonly');
  const store = tx.objectStore(KEY_STORE);
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const req = store.get('master');
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });

  if (existing) {
    await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
    db.close();
    return existing;
  }

  // Generate new non-exportable key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // non-exportable
    ['encrypt', 'decrypt'],
  );

  const wtx = db.transaction(KEY_STORE, 'readwrite');
  const wstore = wtx.objectStore(KEY_STORE);
  await new Promise<void>((resolve, reject) => {
    const req = wstore.put(key, 'master');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    wtx.oncomplete = () => resolve();
    wtx.onerror = () => reject(wtx.error);
  });
  db.close();

  return key;
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE);
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── PIN hashing (PBKDF2 210k iterations) ─────────────────────────────────────

export async function hashPin(pin: string, salt?: Uint8Array): Promise<{ hash: string; salt: Uint8Array }> {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: actualSalt.buffer as ArrayBuffer,
      iterations: 210_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  const hashArray = Array.from(new Uint8Array(derived));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return { hash: hashHex, salt: actualSalt };
}

export async function verifyPin(pin: string, storedHash: string, salt: Uint8Array): Promise<boolean> {
  const { hash } = await hashPin(pin, salt);
  return hash === storedHash;
}

// ── Encrypt/Decrypt ───────────────────────────────────────────────────────────

export async function encryptSession(data: SessionData): Promise<StoredSession> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  return {
    encrypted,
    iv,
  };
}

export async function decryptSession(stored: StoredSession): Promise<SessionData> {
  const key = await getOrCreateKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: stored.iv.buffer as ArrayBuffer },
    key,
    stored.encrypted,
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted)) as SessionData;
}

// ── Storage (IndexedDB) ───────────────────────────────────────────────────────

export async function saveSession(data: SessionData, pinHash?: string): Promise<void> {
  const stored = await encryptSession(data);
  if (pinHash) {
    stored.pinHash = pinHash;
  }

  const db = await openKeyDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await new Promise<void>((resolve, reject) => {
    const req = store.put(stored, 'current');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadSession(): Promise<SessionData | null> {
  const db = await openKeyDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const stored = await new Promise<StoredSession | undefined>((resolve, reject) => {
    const req = store.get('current');
    req.onsuccess = () => resolve(req.result as StoredSession | undefined);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  if (!stored) return null;

  try {
    return await decryptSession(stored);
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const db = await openKeyDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await new Promise<void>((resolve, reject) => {
    const req = store.delete('current');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function hasSession(): Promise<boolean> {
  const session = await loadSession();
  return session !== null;
}
