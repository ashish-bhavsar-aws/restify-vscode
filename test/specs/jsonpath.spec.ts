import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  injectCursorOverlay,
  clickInFrame,
  resetLog,
  log,
  logCheck,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  setUrlAndSend,
  waitForResponse,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

async function openSearchWithJsonPath(frame: Frame, query: string): Promise<void> {
  await clickInFrame(frame, '[title="Search in preview"]');
  await frame.waitForTimeout(300);
  await clickInFrame(frame, '[data-testid="search-mode-jsonpath"]');
  await frame.waitForTimeout(200);
  await frame.locator('[data-testid="search-input"]').fill(query);
  await frame.waitForTimeout(400);
}

test.describe('F23 — JSONPath query in the response viewer', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [JsonPath] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [JsonPath] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [JsonPath] afterAll ===');
    await closeVSCode(app);
  });

  test('queries users by JSONPath and highlights matches', async () => {
    log('--- jsonpath: wildcard child query ---');
    const frame = mainFrame!;

    await setUrlAndSend(frame, mockUrl('/api/json-response'));
    const gotResponse = await waitForResponse(frame, 20_000);
    logCheck('got response', gotResponse);
    expect(gotResponse).toBe(true);

    await openSearchWithJsonPath(frame, '$.users[*].name');

    const count = await frame.locator('[data-testid="jsonpath-count"]').textContent();
    logCheck('jsonpath count', count?.trim());
    expect(count).toContain('2 match');

    const results = await frame.locator('[data-testid="jsonpath-results"]').textContent();
    logCheck('jsonpath shows Alice', results?.includes('$.users[0].name') ?? false);
    logCheck('jsonpath shows Bob', results?.includes('$.users[1].name') ?? false);
    expect(results).toContain('$.users[0].name');
    expect(results).toContain('$.users[1].name');

    const highlights = await frame.locator('.cm-response-jsonpath-match').count();
    logCheck('highlighted matches in viewer', highlights);
    expect(highlights).toBeGreaterThanOrEqual(2);
  });

  test('filters array elements with a JSONPath filter', async () => {
    log('--- jsonpath: filter query ---');
    const frame = mainFrame!;

    await frame.locator('[data-testid="search-input"]').fill('$.users[?(@.id > 1)]');
    await frame.waitForTimeout(400);

    const count = await frame.locator('[data-testid="jsonpath-count"]').textContent();
    logCheck('jsonpath count', count?.trim());
    expect(count).toContain('1 match');

    const results = await frame.locator('[data-testid="jsonpath-results"]').textContent();
    logCheck('filter selected Bob only', results?.includes('$.users[1]') ?? false);
    expect(results).toContain('$.users[1]');
  });

  test('shows an error hint for an invalid expression', async () => {
    log('--- jsonpath: invalid expression ---');
    const frame = mainFrame!;

    await frame.locator('[data-testid="search-input"]').fill('users[*]');
    await frame.waitForTimeout(400);

    const err = await frame.locator('[data-testid="jsonpath-error"]').textContent();
    logCheck('jsonpath error shown', (err ?? '').length > 0);
    expect(err).toContain('must start with "$"');
  });
});
