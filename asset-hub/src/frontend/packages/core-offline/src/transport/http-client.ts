import { defaultClockSkew } from '../util/clock-skew';

export interface HttpClientConfig {
  baseUrl: string;
  getAccessToken(): Promise<string>;
  onUnauthorized?(): Promise<void>;
  getTenantSlug?(): Promise<string | undefined>;
  /** Active UI language; sent as Accept-Language so the API localizes messages. */
  getLocale?(): string;
}

interface HttpResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly detail: string | undefined;

  constructor(status: number, problem: ProblemDetails) {
    // NEVER include the token in the message
    const msg =
      problem.detail ??
      problem.title ??
      `HTTP ${status}`;
    super(msg);
    this.name = 'HttpError';
    this.status = status;
    this.code = problem.code;
    this.detail = problem.detail;
  }
}

function collectHeaders(raw: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  raw.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function parseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
}

export class HttpClient {
  private readonly config: HttpClientConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;
  }

  async post(
    path: string,
    body: unknown,
    opts?: { idempotencyKey?: string; etag?: string },
  ): Promise<HttpResponse> {
    const token = await this.config.getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (this.config.getTenantSlug) {
      const slug = await this.config.getTenantSlug();
      if (slug) headers['X-Tenant'] = slug;
    }
    if (this.config.getLocale) {
      headers['Accept-Language'] = this.config.getLocale();
    }
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }
    if (opts?.etag) {
      headers['If-Match'] = opts.etag;
    }

    let res = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 401 && this.config.onUnauthorized) {
      await this.config.onUnauthorized();
      const freshToken = await this.config.getAccessToken();
      headers['Authorization'] = `Bearer ${freshToken}`;
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    }

    this._feedClockSkew(res.headers);

    const responseBody = await parseBody(res);
    const responseHeaders = collectHeaders(res.headers);

    if (!res.ok) {
      const problem = (responseBody ?? {}) as ProblemDetails;
      throw new HttpError(res.status, problem);
    }

    return { status: res.status, body: responseBody, headers: responseHeaders };
  }

  async get(
    path: string,
    query?: Record<string, string>,
  ): Promise<HttpResponse> {
    const token = await this.config.getAccessToken();
    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
    };
    if (this.config.getTenantSlug) {
      const slug = await this.config.getTenantSlug();
      if (slug) headers['X-Tenant'] = slug;
    }
    if (this.config.getLocale) {
      headers['Accept-Language'] = this.config.getLocale();
    }

    let url = `${this.config.baseUrl}${path}`;
    if (query && Object.keys(query).length > 0) {
      url += '?' + new URLSearchParams(query).toString();
    }

    let res = await fetch(url, { method: 'GET', headers });

    if (res.status === 401 && this.config.onUnauthorized) {
      await this.config.onUnauthorized();
      const freshToken = await this.config.getAccessToken();
      headers['Authorization'] = `Bearer ${freshToken}`;
      res = await fetch(url, { method: 'GET', headers });
    }

    this._feedClockSkew(res.headers);

    const responseBody = await parseBody(res);
    const responseHeaders = collectHeaders(res.headers);

    if (!res.ok) {
      const problem = (responseBody ?? {}) as ProblemDetails;
      throw new HttpError(res.status, problem);
    }

    return { status: res.status, body: responseBody, headers: responseHeaders };
  }

  async patch(
    path: string,
    body: unknown,
    opts?: { idempotencyKey?: string; etag?: string },
  ): Promise<HttpResponse> {
    const token = await this.config.getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (this.config.getTenantSlug) {
      const slug = await this.config.getTenantSlug();
      if (slug) headers['X-Tenant'] = slug;
    }
    if (this.config.getLocale) {
      headers['Accept-Language'] = this.config.getLocale();
    }
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }
    if (opts?.etag) {
      headers['If-Match'] = opts.etag;
    }

    let res = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 401 && this.config.onUnauthorized) {
      await this.config.onUnauthorized();
      const freshToken = await this.config.getAccessToken();
      headers['Authorization'] = `Bearer ${freshToken}`;
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
    }

    this._feedClockSkew(res.headers);

    const responseBody = await parseBody(res);
    const responseHeaders = collectHeaders(res.headers);

    if (!res.ok) {
      const problem = (responseBody ?? {}) as ProblemDetails;
      throw new HttpError(res.status, problem);
    }

    return { status: res.status, body: responseBody, headers: responseHeaders };
  }

  async put(
    path: string,
    body: unknown,
    opts?: { idempotencyKey?: string; etag?: string },
  ): Promise<HttpResponse> {
    const token = await this.config.getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (this.config.getTenantSlug) {
      const slug = await this.config.getTenantSlug();
      if (slug) headers['X-Tenant'] = slug;
    }
    if (this.config.getLocale) {
      headers['Accept-Language'] = this.config.getLocale();
    }
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }
    if (opts?.etag) {
      headers['If-Match'] = opts.etag;
    }

    let res = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 401 && this.config.onUnauthorized) {
      await this.config.onUnauthorized();
      const freshToken = await this.config.getAccessToken();
      headers['Authorization'] = `Bearer ${freshToken}`;
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
    }

    this._feedClockSkew(res.headers);

    const responseBody = await parseBody(res);
    const responseHeaders = collectHeaders(res.headers);

    if (!res.ok) {
      const problem = (responseBody ?? {}) as ProblemDetails;
      throw new HttpError(res.status, problem);
    }

    return { status: res.status, body: responseBody, headers: responseHeaders };
  }

  async delete(
    path: string,
    opts?: { idempotencyKey?: string; etag?: string },
  ): Promise<HttpResponse> {
    const token = await this.config.getAccessToken();
    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
    };
    if (this.config.getTenantSlug) {
      const slug = await this.config.getTenantSlug();
      if (slug) headers['X-Tenant'] = slug;
    }
    if (this.config.getLocale) {
      headers['Accept-Language'] = this.config.getLocale();
    }
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }
    if (opts?.etag) {
      headers['If-Match'] = opts.etag;
    }

    let res = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'DELETE',
      headers,
    });

    if (res.status === 401 && this.config.onUnauthorized) {
      await this.config.onUnauthorized();
      const freshToken = await this.config.getAccessToken();
      headers['Authorization'] = `Bearer ${freshToken}`;
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method: 'DELETE',
        headers,
      });
    }

    this._feedClockSkew(res.headers);

    const responseBody = await parseBody(res);
    const responseHeaders = collectHeaders(res.headers);

    if (!res.ok) {
      const problem = (responseBody ?? {}) as ProblemDetails;
      throw new HttpError(res.status, problem);
    }

    return { status: res.status, body: responseBody, headers: responseHeaders };
  }

  async refreshToken(): Promise<void> {
    if (this.config.onUnauthorized) {
      await this.config.onUnauthorized();
    }
  }

  private _feedClockSkew(headers: Headers): void {
    const dateHeader = headers.get('date');
    if (dateHeader) {
      const serverMs = Date.parse(dateHeader);
      if (!Number.isNaN(serverMs)) {
        defaultClockSkew.addSample(serverMs - Date.now());
      }
    }
  }
}

export { HttpError };
