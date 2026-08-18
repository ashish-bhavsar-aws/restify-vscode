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
  clickResponseTab,
} from '../utils/helpers';

test.describe('Response Timeline', () => {
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

  test('should send request and view timeline', async () => {
    log('--- Test: Send request for timeline ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'timeline-request-sent');
  });

  test('should display timeline tab with timing data', async () => {
    log('--- Test: Timeline tab ---');
    // Look for timeline-related content in response pane
    const resPane = frame.locator('#res-pane');
    const text = await resPane.textContent();
    expect(text).toBeTruthy();

    await screenshot(app.window, 'timeline-response');
  });

  test('should show timing breakdown', async () => {
    log('--- Test: Timing breakdown ---');
    await clickResponseTab(frame, 'logs');
    await frame.waitForTimeout(500);

    const logsPane = frame.locator('#res-pane');
    const text = await logsPane.textContent();
    log(`Logs content: ${(text || '').slice(0, 200)}`);

    await screenshot(app.window, 'timeline-logs');
  });
});
