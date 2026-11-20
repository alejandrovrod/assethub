import { loadSession } from '../../auth/session-store';
import { apiFetch } from '../../lib/http';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5168').replace(/\/$/, '');
const API_ORIGIN = API_BASE.replace(/\/api\/v1$/, '');

export interface AssetManualStatusDto {
  fileName: string;
  mimeType: string;
  source: string;
  downloadUrl?: string | null;
  sizeBytes: number;
  fileHash: string;
  isIndexed: boolean;
  remoteDocumentName?: string | null;
}

export interface AssetCopilotManualsResponse {
  assetId: string;
  assetCode: string;
  assetName: string;
  fileSearchStoreName?: string | null;
  totalManualsCount: number;
  indexedManualsCount: number;
  manuals: AssetManualStatusDto[];
}

export interface CopilotConversationTurn {
  role: 'user' | 'model';
  text: string;
}

export interface FieldCopilotCitation {
  fileName: string;
  pageNumber?: number | null;
  snippet?: string | null;
  downloadUrl?: string | null;
  documentName?: string | null;
  mediaId?: string | null;
}

export interface AskFieldCopilotPayload {
  question?: string;
  audioBase64?: string;
  audioMimeType?: string;
  history?: CopilotConversationTurn[];
  preferredLanguage?: string;
}

export interface FieldCopilotResponse {
  answer: string;
  foundInManuals: boolean;
  citations: FieldCopilotCitation[];
  safetyWarnings: string[];
  indexedManualsCount: number;
  modelUsed: string;
  usedVoiceInput: boolean;
}

async function buildAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const session = await loadSession();
  return {
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    ...(session?.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
    ...extra,
  };
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return data?.error || data?.detail || data?.title || fallback;
  } catch {
    return fallback;
  }
}

export function resolveManualUrl(downloadUrl?: string | null): string {
  if (!downloadUrl) return '';
  if (
    downloadUrl.startsWith('http://') ||
    downloadUrl.startsWith('https://') ||
    downloadUrl.startsWith('data:')
  ) {
    return downloadUrl;
  }
  return `${API_ORIGIN}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`;
}

export async function getAssetCopilotManuals(
  assetId: string,
): Promise<AssetCopilotManualsResponse> {
  const headers = await buildAuthHeaders();
  const res = await apiFetch(`${API_ORIGIN}/api/v1/assets/${assetId}/copilot/manuals`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `HTTP ${res.status}`));
  }
  return res.json();
}

export async function askAssetCopilot(
  assetId: string,
  payload: AskFieldCopilotPayload,
): Promise<FieldCopilotResponse> {
  const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
  const res = await apiFetch(`${API_ORIGIN}/api/v1/assets/${assetId}/copilot/ask`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `HTTP ${res.status}`));
  }
  return res.json();
}
