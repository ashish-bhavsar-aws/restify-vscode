import { describe, it, expect } from 'vitest';
import { executeUserScript } from '../../src/core/script';

describe('executeUserScript', () => {
  it('runs a simple script and returns logs and variables', async () => {
    const result = await executeUserScript(
      "log('hello'); set('foo', 123); vars['bar'] = 'baz';",
      { response: { status: 200 } },
    );

    expect(result.success).toBe(true);
    expect(result.logs).toContain('hello');
    expect(result.variables).toEqual({ foo: 123, bar: 'baz' });
    expect(result.error).toBeUndefined();
  });

  it('returns a timeout error when the script runs too long', async () => {
    const result = await executeUserScript(
      "while(true) {}",
      {},
      50,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('returns a script error on thrown exception', async () => {
    const result = await executeUserScript(
      "throw new Error('boom');",
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });
});
