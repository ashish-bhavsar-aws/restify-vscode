import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageManager } from '../../src/storage/StorageManager';
import {
  parsePostmanEnvironment,
  parseRestifyEnvironment,
  environmentToRestify,
} from '../../src/core/converters';

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
    setKeysForSync: vi.fn(),
  } as any;
}

function createMockSecretStorage() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    store: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    onDidChange: vi.fn(),
    _store: store,
  } as any;
}

const GLOBAL_ENV_ID = 'global-environment';
function makeEnv(id: string, name: string, variables: any[]) {
  return { id, name, variables };
}

describe('StorageManager initial vs current value (F43)', () => {
  let memento: any;
  let manager: StorageManager;

  beforeEach(() => {
    memento = createMockMemento({
      'restify.environments': [makeEnv(GLOBAL_ENV_ID, 'Global', [])],
      'restify.activeEnv': GLOBAL_ENV_ID,
    });
    manager = new StorageManager(memento, undefined, undefined);
  });

  it('establishes an initial value equal to the current value for legacy variables', async () => {
    await manager.saveEnvironment(
      makeEnv('env-1', 'Dev', [
        { key: 'HOST', value: 'https://api.dev' },
        { key: 'EMPTY', value: '' },
      ]),
    );
    const saved = manager.getEnvironments().find((e) => e.id === 'env-1')!;
    expect(saved.variables.find((v) => v.key === 'HOST')!.initialValue).toBe('https://api.dev');
    expect(saved.variables.find((v) => v.key === 'EMPTY')!.initialValue).toBe('');
  });

  it('preserves a distinct initial value alongside the current value', async () => {
    await manager.saveEnvironment(
      makeEnv('env-1', 'Dev', [
        { key: 'HOST', value: 'https://api.dev', initialValue: 'https://api.base' },
      ]),
    );
    const saved = manager.getEnvironments().find((e) => e.id === 'env-1')!;
    const v = saved.variables.find((x) => x.key === 'HOST')!;
    expect(v.initialValue).toBe('https://api.base');
    expect(v.value).toBe('https://api.dev');
  });

  it('resolves the current value (not the initial value) for request variables', async () => {
    await manager.saveEnvironment(
      makeEnv('env-1', 'Dev', [
        { key: 'HOST', value: 'https://api.dev', initialValue: 'https://api.base' },
      ]),
    );
    manager.setActiveEnvironment('env-1');
    expect(manager.resolveVariables('{{HOST}}')).toBe('https://api.dev');
  });

  it('reset semantics: current value copies back from initial after save', async () => {
    await manager.saveEnvironment(
      makeEnv('env-1', 'Dev', [
        { key: 'HOST', value: 'https://api.dev', initialValue: 'https://api.base' },
      ]),
    );
    // Simulate a "reset to initial" from the editor: current ← initial.
    await manager.saveEnvironment(
      makeEnv('env-1', 'Dev', [
        { key: 'HOST', value: 'https://api.base', initialValue: 'https://api.base' },
      ]),
    );
    manager.setActiveEnvironment('env-1');
    expect(manager.resolveVariables('{{HOST}}')).toBe('https://api.base');
    const saved = manager.getEnvironments().find((e) => e.id === 'env-1')!;
    expect(saved.variables[0].initialValue).toBe('https://api.base');
  });

  it('persist semantics: initial value copies forward from current after save', async () => {
    await manager.saveEnvironment(
      makeEnv('env-1', 'Dev', [
        { key: 'HOST', value: 'https://api.dev', initialValue: 'https://api.base' },
      ]),
    );
    // Simulate a "persist" from the editor: initial ← current.
    await manager.saveEnvironment(
      makeEnv('env-1', 'Dev', [
        { key: 'HOST', value: 'https://api.dev', initialValue: 'https://api.dev' },
      ]),
    );
    const saved = manager.getEnvironments().find((e) => e.id === 'env-1')!;
    expect(saved.variables[0].initialValue).toBe('https://api.dev');
  });

  it('keeps a single encrypted value for secret variables (no initial split)', async () => {
    const secrets = createMockSecretStorage();
    manager = new StorageManager(memento, undefined, secrets);
    await manager.saveEnvironment(
      makeEnv('env-1', 'Dev', [
        { key: 'KEY', value: 'plain', isSecret: true, initialValue: 'plain' },
      ]),
    );
    const saved = manager.getEnvironments().find((e) => e.id === 'env-1')!;
    const v = saved.variables.find((x) => x.key === 'KEY')!;
    expect(v.value).toBe('');
    expect(v.initialValue).toBeUndefined();
    expect(await manager.getSecretValue('env-1', 'KEY')).toBe('plain');
  });
});

describe('Environment converters initial value (F43)', () => {
  it('parsePostmanEnvironment reads the `initial` field when present', () => {
    const parsed = parsePostmanEnvironment({
      name: 'Dev',
      values: [
        { key: 'HOST', value: 'https://api.dev', initial: 'https://api.base' },
        { key: 'PLAIN', value: 'v' },
      ],
    });
    expect(parsed!.variables[0]).toMatchObject({
      key: 'HOST',
      value: 'https://api.dev',
      initialValue: 'https://api.base',
    });
    expect(parsed!.variables[1].initialValue).toBeUndefined();
  });

  it('parseRestifyEnvironment preserves initialValue', () => {
    const parsed = parseRestifyEnvironment({
      name: 'Dev',
      variables: [
        { key: 'HOST', value: 'https://api.dev', initialValue: 'https://api.base' },
      ],
    });
    expect(parsed!.variables[0].initialValue).toBe('https://api.base');
  });

  it('environmentToRestify emits initialValue for non-secret variables', () => {
    const out = environmentToRestify({
      name: 'Dev',
      variables: [
        { key: 'HOST', value: 'https://api.dev', initialValue: 'https://api.base' },
        { key: 'KEY', value: '', isSecret: true },
      ],
    });
    expect(out.variables[0]).toMatchObject({
      key: 'HOST',
      value: 'https://api.dev',
      initialValue: 'https://api.base',
    });
    expect(out.variables[1].initialValue).toBeUndefined();
  });
});
