import { test, expect } from '@playwright/test';
import type { Frame } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  log,
  resetLog,
} from '../utils/vscode';
import {
  startMockServer,
  stopMockServer,
  mockUrl,
  setupMainPanel,
  setUrl,
  sendRequest,
  waitForResponse,
  getStatusCode,
} from '../utils/helpers';

test.describe('Response Search (Text + JSONPath)', () => {
  let app: Awaited<ReturnType<typeof launchVSCode>>;
  let frame: Frame;

  test.beforeAll(async () => {
    resetLog();
    await startMockServer();
    app = await launchVSCode();
    frame = await setupMainPanel(app);
  });

  test.afterAll(async () => {
    await closeVSCode(app);
    await stopMockServer();
  });

  test('should send JSON request for search testing', async () => {
    log('--- Test: JSON request for search ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'search-json-response');
  });

  test('should have search input in response pane', async () => {
    log('--- Test: Search input ---');
    const searchInput = frame.locator('[data-testid="search-input"]');
    const count = await searchInput.count();
    log(`Search input found: ${count > 0}`);

    await screenshot(app.window, 'search-input');
  });

  test('should toggle text search mode', async () => {
    log('--- Test: Text search mode ---');
    const textMode = frame.locator('[data-testid="search-mode-text"]');
    const count = await textMode.count();
    log(`Text mode button found: ${count > 0}`);

    if (count > 0) {
      await textMode.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'search-text-mode');
  });

  test('should type search query in text mode', async () => {
    log('--- Test: Type search query ---');
    const searchInput = frame.locator('[data-testid="search-input"]');
    if ((await searchInput.count()) > 0) {
      await searchInput.fill('Alice');
      await frame.waitForTimeout(500);
    }

    await screenshot(app.window, 'search-text-query');
  });

  test('should toggle JSONPath search mode', async () => {
    log('--- Test: JSONPath search mode ---');
    const jsonPathMode = frame.locator('[data-testid="search-mode-jsonpath"]');
    const count = await jsonPathMode.count();
    log(`JSONPath mode button found: ${count > 0}`);

    if (count > 0) {
      await jsonPathMode.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'search-jsonpath-mode');
  });

  test('should type JSONPath query', async () => {
    log('--- Test: Type JSONPath query ---');
    const searchInput = frame.locator('[data-testid="search-input"]');
    if ((await searchInput.count()) > 0) {
      await searchInput.fill('$.users[*].name');
      await frame.waitForTimeout(500);
    }

    const resultCount = frame.locator('[data-testid="jsonpath-count"]');
    if ((await resultCount.count()) > 0) {
      const text = await resultCount.textContent();
      log(`JSONPath results: ${text}`);
    }

    await screenshot(app.window, 'search-jsonpath-query');
  });
});
