import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { HttpClient, HttpError } from './http-client';

// ── MSW server setup ──────────────────────────────────────────────────────────

const BASE = 'http://test.local';

const server = setupServer(
  // Echo request headers back as JSON body — used by most tests
  http.post(`${BASE}/echo`, ({ request }) => {
    const auth = request.headers.get('authorization') ?? '';
    const idempKey = request.headers.get('idempotency-key') ?? '';
    const ifMatch = request.headers.get('if-match') ?? '';
    return HttpResponse.json({ auth, idempKey, ifMatch });
  }),

  // ProblemDetails error endpoint
  http.post(`${BASE}/error-problem`, () => {
    return HttpResponse.json(
      { type: 'urn:problem:not-found', title: 'Not Found', status: 404, code: 'resource_not_found', detail: 'Entity does not exist' },
      { status: 404 },
    );
  }),

  // 500 endpoint (no body)
  http.post(`${BASE}/error-500`, () => {
    return new HttpResponse(null, { status: 500 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'super-secret-token';

function makeClient(): HttpClient {
  return new HttpClient({
    baseUrl: BASE,
    getAccessToken: async () => ACCESS_TOKEN,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HttpClient', () => {
  it('sends Authorization: Bearer header', async () => {
    const client = makeClient();
    const res = await client.post('/echo', {});
    const body = res.body as Record<string, string>;
    expect(body.auth).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('sends Idempotency-Key header when provided', async () => {
    const client = makeClient();
    const res = await client.post('/echo', {}, { idempotencyKey: 'idem-123' });
    const body = res.body as Record<string, string>;
    expect(body.idempKey).toBe('idem-123');
  });

  it('does NOT send Idempotency-Key when not provided', async () => {
    const client = makeClient();
    const res = await client.post('/echo', {});
    const body = res.body as Record<string, string>;
    expect(body.idempKey).toBe('');
  });

  it('sends If-Match header when provided', async () => {
    const client = makeClient();
    const res = await client.post('/echo', {}, { etag: '"abc123"' });
    const body = res.body as Record<string, string>;
    expect(body.ifMatch).toBe('"abc123"');
  });

  it('does NOT include the token in the error message', async () => {
    const client = makeClient();
    try {
      await client.post('/error-500', {});
      expect.fail('should have thrown');
    } catch (err) {
      const error = err as Error;
      expect(error.message).not.toContain(ACCESS_TOKEN);
    }
  });

  it('propagates code from RFC 9457 ProblemDetails', async () => {
    const client = makeClient();
    try {
      await client.post('/error-problem', {});
      expect.fail('should have thrown');
    } catch (err) {
      const error = err as HttpError;
      expect(error).toBeInstanceOf(HttpError);
      expect(error.status).toBe(404);
      expect(error.code).toBe('resource_not_found');
      expect(error.detail).toBe('Entity does not exist');
      // Token must not appear anywhere in the message
      expect(error.message).not.toContain(ACCESS_TOKEN);
    }
  });
});
