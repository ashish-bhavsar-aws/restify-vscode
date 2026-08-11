import { describe, it, expect, vi } from 'vitest';
import {
  runCollectionTestScript,
  runPreScriptPipeline,
} from '../../src/core/collectionScripts';

describe('runPreScriptPipeline', () => {
  const startTime = Date.now();

  function host(overrides: Record<string, unknown> = {}) {
    return {
      postError: vi.fn(),
      appendActivity: vi.fn(),
      addFailedHistory: vi.fn(async () => undefined),
      setScriptVariables: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  it('runs the scripts and persists extracted variables', async () => {
    const h = host();
    const result = await runPreScriptPipeline(
      h,
      [`set('token', 'abc123');`],
      { method: 'GET', url: '/ok' },
      startTime,
    );
    expect(result.aborted).toBe(false);
    expect(result.variables).toEqual({ token: 'abc123' });
    expect(h.setScriptVariables).toHaveBeenCalledWith({ token: 'abc123' });
    expect(h.postError).not.toHaveBeenCalled();
  });

  it('reports a failing script and still persists partial variables', async () => {
    const h = host();
    const result = await runPreScriptPipeline(
      h,
      [`set('token', 'abc123'); throw new Error('boom');`],
      { method: 'GET', url: '/ok' },
      startTime,
    );
    expect(result.aborted).toBe(true);
    expect(h.setScriptVariables).toHaveBeenCalledWith({ token: 'abc123' });
    expect(h.postError).toHaveBeenCalledWith(
      'Pre-request script failed: boom',
      expect.any(Number),
    );
    expect(h.appendActivity).toHaveBeenCalledWith(
      'Pre-request script failed',
      expect.stringContaining('URL: /ok'),
    );
    expect(h.addFailedHistory).toHaveBeenCalled();
  });

  it('does not persist variables when scripts extract none', async () => {
    const h = host();
    const result = await runPreScriptPipeline(
      h,
      [`log('hello');`],
      { method: 'GET', url: '/ok' },
      startTime,
    );
    expect(result.aborted).toBe(false);
    expect(h.setScriptVariables).not.toHaveBeenCalled();
  });
});

describe('runCollectionTestScript', () => {
  it('parses a JSON body and exposes response globals', async () => {
    const { result, context } = await runCollectionTestScript(
      `tests['json'] = response.body.ok === true; tests['status'] = status === 200;`,
      { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: '{"ok":true}' },
    );
    expect(result.success).toBe(true);
    expect(result.tests).toEqual({ json: true, status: true });
    expect((context.response as any).body).toEqual({ ok: true });
    expect((context.response as any).rawBody).toBe('{"ok":true}');
  });

  it('keeps a non-JSON body as a raw string', async () => {
    const { context } = await runCollectionTestScript(
      `tests['ok'] = true;`,
      { status: 200, body: '<html>hi</html>' },
    );
    expect((context.response as any).body).toBe('<html>hi</html>');
  });

  it('reports a script error in the result', async () => {
    const { result } = await runCollectionTestScript(
      `throw new Error('test boom');`,
      { status: 500 },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('test boom');
  });
});
