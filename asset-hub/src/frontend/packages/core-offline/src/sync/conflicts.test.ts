import { describe, it, expect } from 'vitest';
import { resolveConflict } from './conflicts';
import type { OutboxMutation } from '../db/schema';

function stub(): OutboxMutation {
  return {
    id: 'aaaaaaaa-0000-7000-8000-000000000001',
    tenantId: 'tenant-1',
    aggregateType: 'task',
    aggregateId: 'task-1',
    operation: 'task.state',
    method: 'PATCH',
    path: '/api/v1/tasks/task-1/state',
    status: 'pending',
    priority: 100,
    attempts: 1,
    nextAttemptAtMs: 0,
    createdAtMs: Date.now(),
  };
}

describe('resolveConflict', () => {
  it('409 + invalid_transition → discard', () => {
    const res = resolveConflict(stub(), { status: 409, body: { code: 'invalid_transition' } });
    expect(res.action).toBe('discard');
  });

  it('409 other code → retry', () => {
    const res = resolveConflict(stub(), { status: 409, body: { code: 'concurrent_update' } });
    expect(res.action).toBe('retry');
  });

  it('409 no code → retry', () => {
    const res = resolveConflict(stub(), { status: 409, body: {} });
    expect(res.action).toBe('retry');
  });

  it('412 → block', () => {
    const res = resolveConflict(stub(), { status: 412, body: {} });
    expect(res.action).toBe('block');
  });

  it('422 → dead with validation_error', () => {
    const res = resolveConflict(stub(), { status: 422, body: {} });
    expect(res.action).toBe('dead');
    expect(res.patch?.lastErrorCode).toBe('validation_error');
  });

  it('423 → retry', () => {
    const res = resolveConflict(stub(), { status: 423, body: {} });
    expect(res.action).toBe('retry');
  });

  it('400 → dead with bad_request', () => {
    const res = resolveConflict(stub(), { status: 400, body: {} });
    expect(res.action).toBe('dead');
    expect(res.patch?.lastErrorCode).toBe('bad_request');
  });

  it('404 → discard (aggregate deleted)', () => {
    const res = resolveConflict(stub(), { status: 404, body: {} });
    expect(res.action).toBe('discard');
  });

  it.each([500, 502, 503, 504])('%i → retry', (status) => {
    const res = resolveConflict(stub(), { status, body: {} });
    expect(res.action).toBe('retry');
  });

  it('2xx → discard (graceful fallback)', () => {
    const res = resolveConflict(stub(), { status: 200, body: {} });
    expect(res.action).toBe('discard');
  });

  it('unknown status → retry', () => {
    const res = resolveConflict(stub(), { status: 418, body: {} });
    expect(res.action).toBe('retry');
  });
});
