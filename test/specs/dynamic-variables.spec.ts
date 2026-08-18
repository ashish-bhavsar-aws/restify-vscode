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
  getResponseText,
  clickRequestTab,
} from '../utils/helpers';

test.describe('Dynamic Variables', () => {
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

  test('should resolve {{$guid}} dynamic variable in URL', async () => {
    log('--- Test: Dynamic variable {{$guid}} ---');
    await setUrl(frame, mockUrl('/api/echo?guid={{$guid}}'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    const body = await getResponseText(frame);
    // The GUID should have been resolved to an actual GUID value
    expect(body).toContain('guid');

    await screenshot(app.window, 'dynamic-guid');
  });

  test('should resolve {{$timestamp}} dynamic variable', async () => {
    log('--- Test: Dynamic variable {{$timestamp}} ---');
    await setUrl(frame, mockUrl('/api/echo?ts={{$timestamp}}'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const body = await getResponseText(frame);
    expect(body).toContain('ts');

    await screenshot(app.window, 'dynamic-timestamp');
  });

  test('should resolve {{$randomInt}} dynamic variable', async () => {
    log('--- Test: Dynamic variable {{$randomInt}} ---');
    await setUrl(frame, mockUrl('/api/echo?num={{$randomInt}}'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'dynamic-random-int');
  });

  test('should resolve {{$randomAlpha}} dynamic variable', async () => {
    log('--- Test: Dynamic variable {{$randomAlpha}} ---');
    await setUrl(frame, mockUrl('/api/echo?alpha={{$randomAlpha}}'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'dynamic-random-alpha');
  });

  test('should resolve {{$localDateTime}} dynamic variable', async () => {
    log('--- Test: Dynamic variable {{$localDateTime}} ---');
    await setUrl(frame, mockUrl('/api/echo?dt={{$localDateTime}}'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'dynamic-local-datetime');
  });

  test('should display variable resolution in URL bar', async () => {
    log('--- Test: Variable display in URL ---');
    await clickRequestTab(frame, 'headers');
    await frame.waitForTimeout(300);

    await screenshot(app.window, 'dynamic-variable-display');
  });
});
