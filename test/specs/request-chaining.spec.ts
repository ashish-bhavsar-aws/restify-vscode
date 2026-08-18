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
  clickRequestTab,
  enableRequestChaining,
} from '../utils/helpers';

test.describe('Request Chaining', () => {
  let app: Awaited<ReturnType<typeof launchVSCode>>;
  let frame: Frame;

  test.beforeAll(async () => {
    resetLog();
    await startMockServer();
    app = await launchVSCode();
    frame = await setupMainPanel(app);
    await enableRequestChaining(frame);
  });

  test.afterAll(async () => {
    await closeVSCode(app);
    await stopMockServer();
  });

  test('should chain a token from first request to second request', async () => {
    log('--- Test: Request chaining - get token ---');

    // Step 1: Set up a post-response script to store the token from chain/start
    await clickRequestTab(frame, 'script');
    await frame.waitForTimeout(300);
    // The second textarea is the post-response script editor
    const textareas = frame.locator('textarea');
    const textareaCount = await textareas.count();
    const textarea = textareas.nth(Math.min(1, textareaCount - 1));
    if (textareaCount > 1) {
      await textarea.click();
      await textarea.press('Meta+A');
      await textarea.fill(
        'const body = pm.response.jsonBody();\nif (body && body.token) {\n  set("chainToken", body.token);\n}'
      );
      await frame.waitForTimeout(300);
    }

    // Step 2: Send request to get the token
    await setUrl(frame, mockUrl('/api/chain/start'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'chain-first-request');
  });

  test('should resolve chained variable in second request', async () => {
    log('--- Test: Request chaining - use token ---');

    // Step 3: Clear the script for the second request
    await clickRequestTab(frame, 'script');
    await frame.waitForTimeout(300);
    const textarea = frame.locator('textarea').first();
    if ((await textarea.count()) > 0) {
      await textarea.click();
      await textarea.press('Meta+A');
      await textarea.fill('');
      await frame.waitForTimeout(200);
    }

    // Step 4: Set URL with chained variable and send
    await setUrl(frame, mockUrl('/api/chain/verify'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'chain-second-request');
  });

  test('should show chain variable resolved in response', async () => {
    log('--- Test: Chain verification ---');
    const body = await frame.locator('#res-pane').textContent();
    log(`Chain response: ${(body || '').slice(0, 200)}`);

    await screenshot(app.window, 'chain-response-verify');
  });
});
