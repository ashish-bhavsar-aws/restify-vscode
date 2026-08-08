import { describe, it, expect } from 'vitest';
import { mergeVariableScopes, applyVariableMap } from '../../src/core/variableScope';

describe('mergeVariableScopes (F42)', () => {
  it('later scopes override earlier ones for keys they define', () => {
    const merged = mergeVariableScopes([
      { name: 'global', values: { base: 'g', shared: 'global' } },
      { name: 'collection', values: { base: 'c', shared: 'collection' } },
      { name: 'environment', values: { base: 'e', only: 'env' } },
    ]);
    expect(merged).toEqual({ base: 'e', shared: 'collection', only: 'env' });
  });

  it('empty scopes produce an empty map', () => {
    expect(mergeVariableScopes([])).toEqual({});
  });

  it('ignores empty keys and nullish values, keeps empty-string values', () => {
    const merged = mergeVariableScopes([
      { name: 'env', values: { '': 'nope', real: undefined as unknown as string, empty: '', ok: 'yes' } },
    ]);
    expect(merged).toEqual({ real: '', empty: '', ok: 'yes' });
  });
});

describe('applyVariableMap (F42)', () => {
  it('replaces every {{key}} occurrence', () => {
    const out = applyVariableMap('GET {{host}}/{{host}}/x', { host: 'example.com' });
    expect(out).toBe('GET example.com/example.com/x');
  });

  it('leaves unknown tokens untouched', () => {
    expect(applyVariableMap('{{missing}} kept', { known: 'v' })).toBe('{{missing}} kept');
  });

  it('is safe with keys containing regex special characters', () => {
    const out = applyVariableMap('{{a.b+c}}', { 'a.b+c': 'ok' });
    expect(out).toBe('ok');
  });
});
