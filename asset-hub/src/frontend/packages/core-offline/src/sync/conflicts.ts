import type { OutboxMutation } from '../db/schema';

export interface ConflictResolution {
  action: 'retry' | 'discard' | 'block' | 'dead';
  patch?: Partial<OutboxMutation>;
}

interface ResponseShape {
  status: number;
  body: unknown;
}

function bodyCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'code' in body) {
    return (body as Record<string, unknown>)['code'] as string | undefined;
  }
  return undefined;
}

/**
 * Determine how to handle a non-2xx HTTP response from the sync backend.
 *
 * Resolution matrix:
 *  409 + body.code === 'invalid_transition' → discard
 *  409 other                                → retry
 *  412                                      → block
 *  422                                      → dead (validation_error)
 *  423                                      → retry
 *  400                                      → dead (bad_request)
 *  404                                      → discard (aggregate deleted)
 *  500 / 502 / 503 / 504                    → retry
 *  2xx                                      → discard (should not be called, handled gracefully)
 *  unknown                                  → retry
 */
export function resolveConflict(
  _mutation: OutboxMutation,
  response: ResponseShape,
): ConflictResolution {
  const { status, body } = response;

  // 2xx — should not be called, but handle gracefully
  if (status >= 200 && status < 300) {
    return { action: 'discard' };
  }

  switch (status) {
    case 400:
      return { action: 'dead', patch: { lastErrorCode: 'bad_request' } };

    case 404:
      return { action: 'discard' };

    case 409:
      if (bodyCode(body) === 'invalid_transition') {
        return { action: 'discard' };
      }
      return { action: 'retry' };

    case 412:
      return { action: 'block' };

    case 422:
      return { action: 'dead', patch: { lastErrorCode: 'validation_error' } };

    case 423:
      return { action: 'retry' };

    case 500:
    case 502:
    case 503:
    case 504:
      return { action: 'retry' };

    default:
      return { action: 'retry' };
  }
}
