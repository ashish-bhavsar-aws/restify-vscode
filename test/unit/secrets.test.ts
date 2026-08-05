import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('StorageManager secret variables (F41)', () => {
  let memento: any;
  let secrets: any;
  let manager: StorageManager;

  beforeEach(() => {
    memento = createMockMemento({
      'restify.environments': [makeEnv(GLOBAL_ENV_ID, 'Global', [])],
      'restify.activeEnv': GLOBAL_ENV_ID,
    });
    secrets = createMockSecretStorage();
    manager = new StorageManager(memento, undefined, secrets);
  });

  it('stores secret values in SecretStorage, not in globalState', async () => {
    const env = makeEnv('env-1', 'Prod', [
      { key: 'API_KEY', value: 'plaintext-key', isSecret: true },
      { key: 'BASE_URL', value: 'https://api.example.com' },
    ]);

    await manager.saveEnvironment(env);

    const saved = memento.get('restify.environments').find((e: any) => e.id === 'env-1');
    expect(saved.variables.find((v: any) => v.key === 'API_KEY').value).toBe('');
    expect(saved.variables.find((v: any) => v.key === 'API_KEY').isSecret).toBe(true);
    expect(saved.variables.find((v: any) => v.key === 'BASE_URL').value).toBe(
      'https://api.example.com',
    );
    expect(secrets._store.size).toBeGreaterThan(0);
    expect(Array.from(secrets._store.values())).toContain('plaintext-key');
  });

  it('resolves secret values when the environment is active', async () => {
    const env = makeEnv('env-1', 'Prod', [
      { key: 'TOKEN', value: 'super-secret', isSecret: true },
    ]);
    await manager.saveEnvironment(env);
    await manager.setActiveEnvironment('env-1');

    expect(manager.resolveVariables('Bearer {{TOKEN}}')).toBe('Bearer super-secret');
  });

  it('hydrates secret cache from SecretStorage on startup', async () => {
    await manager.saveEnvironment(
      makeEnv('env-1', 'Prod', [{ key: 'TOKEN', value: 'super-secret', isSecret: true }]),
    );
    // Simulate a fresh manager instance re-reading persisted state
    const manager2 = new StorageManager(memento, undefined, secrets);
    await manager2.hydrateSecrets();
    await manager2.setActiveEnvironment('env-1');

    expect(manager2.resolveVariables('{{TOKEN}}')).toBe('super-secret');
  });

  it('keeps an existing secret when the incoming value is empty', async () => {
    const env = makeEnv('env-1', 'Prod', [
      { key: 'TOKEN', value: 'abc123', isSecret: true },
    ]);
    await manager.saveEnvironment(env);

    // Re-save with empty value → keep the stored secret
    await manager.saveEnvironment(
      makeEnv('env-1', 'Prod', [{ key: 'TOKEN', value: '', isSecret: true }]),
    );
    await manager.setActiveEnvironment('env-1');

    expect(manager.resolveVariables('{{TOKEN}}')).toBe('abc123');
  });

  it('removes a secret from SecretStorage when unmarked', async () => {
    await manager.saveEnvironment(
      makeEnv('env-1', 'Prod', [{ key: 'TOKEN', value: 'abc123', isSecret: true }]),
    );
    expect(secrets._store.size).toBeGreaterThan(0);

    await manager.saveEnvironment(
      makeEnv('env-1', 'Prod', [{ key: 'TOKEN', value: 'now-plain', isSecret: false }]),
    );

    const saved = memento.get('restify.environments').find((e: any) => e.id === 'env-1');
    expect(saved.variables.find((v: any) => v.key === 'TOKEN').value).toBe('now-plain');
    expect(secrets._store.size).toBe(0);
  });

  it('deletes all secrets when the environment is deleted', async () => {
    await manager.saveEnvironment(
      makeEnv('env-1', 'Prod', [
        { key: 'A', value: 'a', isSecret: true },
        { key: 'B', value: 'b', isSecret: true },
      ]),
    );
    expect(secrets._store.size).toBe(2);

    await manager.deleteEnvironment('env-1');
    expect(secrets._store.size).toBe(0);
    expect(memento.get('restify.environments').find((e: any) => e.id === 'env-1')).toBeUndefined();
  });

  it('works without SecretStorage (falls back to plaintext-free resolution)', async () => {
    const plain = new StorageManager(memento, undefined, undefined);
    await plain.saveEnvironment(
      makeEnv('env-2', 'NoSecrets', [{ key: 'K', value: 'v', isSecret: false }]),
    );
    await plain.setActiveEnvironment('env-2');
    expect(plain.resolveVariables('{{K}}')).toBe('v');
    // Secret values are dropped when no SecretStorage is available
    await plain.saveEnvironment(
      makeEnv('env-2', 'NoSecrets', [{ key: 'S', value: 's', isSecret: true }]),
    );
    const saved = memento.get('restify.environments').find((e: any) => e.id === 'env-2');
    expect(saved.variables.find((v: any) => v.key === 'S').value).toBe('');
  });

  it('getSecretValue returns the stored secret', async () => {
    await manager.saveEnvironment(
      makeEnv('env-1', 'Prod', [{ key: 'TOKEN', value: 'xyz', isSecret: true }]),
    );
    await expect(manager.getSecretValue('env-1', 'TOKEN')).resolves.toBe('xyz');
  });
});
