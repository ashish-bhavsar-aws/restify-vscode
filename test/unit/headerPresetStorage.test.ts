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

const PRESETS = [
  {
    id: 'preset-1',
    name: 'Common',
    headers: [
      { key: 'X-Custom', value: 'abc', enabled: true },
      { key: 'X-Empty', value: '', enabled: false },
    ],
  },
];

describe('StorageManager header presets via settings (F20)', () => {
  it('round-trips presets through getSettings/saveSettings', () => {
    const sm = new StorageManager(createMockMemento());
    const settings = sm.getSettings();
    settings.headerPresets = PRESETS;
    sm.saveSettings(settings);

    const loaded = sm.getSettings();
    expect(loaded.headerPresets).toHaveLength(1);
    expect(loaded.headerPresets[0]).toMatchObject({ id: 'preset-1', name: 'Common' });
    expect(loaded.headerPresets[0].headers).toHaveLength(2);
  });

  it('normalizes preset header rows on load', () => {
    const sm = new StorageManager(
      createMockMemento({
        'restify.settings': {
          headerPresets: [
            {
              id: 'preset-2',
              name: 'Ragged',
              headers: [{ key: 'A', value: '1', enabled: false }, { key: 'B' }],
            },
          ],
        },
      }),
    );
    const loaded = sm.getSettings();
    expect(loaded.headerPresets[0].headers[1]).toMatchObject({ key: 'B', value: '', enabled: true });
  });

  it('defaults to an empty list when nothing is saved', () => {
    const sm = new StorageManager(createMockMemento());
    expect(sm.getSettings().headerPresets).toEqual([]);
  });

  it('deletes a preset via settings save', () => {
    const sm = new StorageManager(createMockMemento());
    const settings = sm.getSettings();
    settings.headerPresets = PRESETS;
    sm.saveSettings(settings);

    const next = sm.getSettings();
    next.headerPresets = next.headerPresets.filter((p) => p.id !== 'preset-1');
    sm.saveSettings(next);

    expect(sm.getSettings().headerPresets).toEqual([]);
  });
});
