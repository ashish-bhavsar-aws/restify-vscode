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

describe('test assertions (tests object)', () => {
  it('captures pass/fail test assertions', async () => {
    const result = await executeUserScript(
      `tests["status is 200"] = response.status === 200;
       tests["has body"] = response.body.length > 0;
       tests["should fail"] = false;`,
      { response: { status: 200, body: '{"ok":true}' } },
    );

    expect(result.success).toBe(true);
    expect(result.tests).toEqual({
      'status is 200': true,
      'has body': true,
      'should fail': false,
    });
  });

  it('returns empty tests object when no assertions defined', async () => {
    const result = await executeUserScript(
      "log('no tests here');",
      { response: { status: 200 } },
    );

    expect(result.success).toBe(true);
    expect(result.tests).toEqual({});
  });

  it('tests are captured even when script fails after assertions', async () => {
    const result = await executeUserScript(
      `tests["first"] = true;
       throw new Error('boom');`,
      {},
    );

    expect(result.success).toBe(false);
    expect(result.tests).toEqual({ first: true });
  });

  it('supports dynamic test names', async () => {
    const result = await executeUserScript(
      `const cases = [200, 201, 204];
       cases.forEach(code => {
         tests["status " + code] = response.status === code;
       });`,
      { response: { status: 201 } },
    );

    expect(result.success).toBe(true);
    expect(result.tests).toEqual({
      'status 200': false,
      'status 201': true,
      'status 204': false,
    });
  });

  it('tests work with response helpers (headers, statusText)', async () => {
    const result = await executeUserScript(
      `tests["status OK"] = status === 200;
       tests["content-type json"] = headers["content-type"]?.includes("json");`,
      {
        response: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      },
    );

    expect(result.success).toBe(true);
    expect(result.tests).toEqual({
      'status OK': true,
      'content-type json': true,
    });
  });
});
