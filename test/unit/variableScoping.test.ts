import { describe, it, expect } from 'vitest';
import { StorageManager } from '../../src/storage/StorageManager';

function createMockMemento(initial: Record<string, any> = {}) {
  const store = new Map<string, any>(Object.entries(initial));
  return {
    get: (key: string, fallback: any = undefined) => {
      return store.has(key) ? store.get(key) : fallback;
    },
    update: (key: string, value: any) => {
      store.set(key, value);
      return Promise.resolve();
    },
    keys: () => Array.from(store.keys()),
  } as any;
}

function makeEnv(id: string, name: string, variables: any[]) {
  return { id, name, variables };
}

describe('StorageManager variable scoping (F42)', () => {
  it('applies global variables even when another environment is active', () => {
    const sm = new StorageManager(
      createMockMemento({
        'restify.environments': [
          makeEnv('global-environment', 'Global', [
            { key: 'base', value: 'GLOBAL' },
            { key: 'onlyGlobal', value: 'GLB' },
          ]),
          makeEnv('dev', 'Dev', [{ key: 'base', value: 'DEV' }]),
        ],
        'restify.activeEnv': 'dev',
      }),
    );
    // Environment overrides global; global keys still resolve.
    expect(sm.resolveVariables('{{base}}|{{onlyGlobal}}')).toBe('DEV|GLB');
  });

  it('applies collection variables when the collectionId is provided', () => {
    const sm = new StorageManager(
      createMockMemento({
        'restify.collections': [
          {
            id: 'c1',
            name: 'Col',
            variables: [
              { key: 'shared', value: 'COLL' },
              { key: 'colOnly', value: 'COL' },
            ],
          },
        ],
        'restify.environments': [
          makeEnv('global-environment', 'Global', []),
          makeEnv('dev', 'Dev', [{ key: 'shared', value: 'DEV' }]),
        ],
        'restify.activeEnv': 'dev',
      }),
    );
    expect(sm.resolveVariables('{{shared}}|{{colOnly}}', undefined, 'c1')).toBe(
      'DEV|COL',
    );
    // Without a collectionId, collection variables are not in scope.
    expect(sm.resolveVariables('{{shared}}|{{colOnly}}', undefined)).toBe('DEV|{{colOnly}}');
  });

  it('session chain variables override environment variables', () => {
    const sm = new StorageManager(
      createMockMemento({
        'restify.environments': [
          makeEnv('global-environment', 'Global', [{ key: 'token', value: 'G' }]),
          makeEnv('dev', 'Dev', [{ key: 'token', value: 'ENV' }]),
        ],
        'restify.activeEnv': 'dev',
      }),
    );
    sm.setSessionChainVars('s1', { token: 'SCRIPT' });
    expect(sm.resolveVariables('{{token}}', 's1')).toBe('SCRIPT');
    expect(sm.resolveVariables('{{token}}', 'other-session')).toBe('ENV');
  });

  it('getCollectionVariables returns the collection variable list', () => {
    const sm = new StorageManager(
      createMockMemento({
        'restify.collections': [
          { id: 'c1', name: 'Col', variables: [{ key: 'k', value: 'v' }] },
        ],
      }),
    );
    expect(sm.getCollectionVariables('c1')).toEqual([{ key: 'k', value: 'v' }]);
    expect(sm.getCollectionVariables('missing')).toEqual([]);
    expect(sm.getCollectionVariables()).toEqual([]);
  });

  it('getActiveEnvironmentVariables falls back to globals and overrides with the active env', () => {
    const sm = new StorageManager(
      createMockMemento({
        'restify.environments': [
          makeEnv('global-environment', 'Global', [
            { key: 'a', value: 'GA' },
            { key: 'b', value: 'GB' },
          ]),
          makeEnv('dev', 'Dev', [{ key: 'b', value: 'DB' }]),
        ],
        'restify.activeEnv': 'dev',
      }),
    );
    expect(sm.getActiveEnvironmentVariables()).toEqual({ a: 'GA', b: 'DB' });
  });
});
