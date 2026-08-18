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

test.describe('Response Viewer', () => {
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

  test('should display JSON response in body tab', async () => {
    log('--- Test: JSON response body ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await clickResponseTab(frame, 'body');
    await frame.waitForTimeout(500);

    const body = await frame.locator('#res-pane').textContent();
    expect(body).toContain('Alice');

    await screenshot(app.window, 'response-json-body');
  });

  test('should display CSV response', async () => {
    log('--- Test: CSV response ---');
    await setUrl(frame, mockUrl('/api/csv'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await clickResponseTab(frame, 'body');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'response-csv');
  });

  test('should display plain text response', async () => {
    log('--- Test: Plain text response ---');
    await setUrl(frame, mockUrl('/api/text'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await clickResponseTab(frame, 'body');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'response-plain-text');
  });

  test('should display XML response', async () => {
    log('--- Test: XML response ---');
    await setUrl(frame, mockUrl('/api/xml-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await clickResponseTab(frame, 'body');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'response-xml');
  });

  test('should display gzip-compressed response', async () => {
    log('--- Test: Gzip response ---');
    await setUrl(frame, mockUrl('/api/gzip'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await clickResponseTab(frame, 'body');
    await frame.waitForTimeout(500);

    const body = await frame.locator('#res-pane').textContent();
    expect(body).toContain('compressed');

    await screenshot(app.window, 'response-gzip');
  });

  test('should view raw response', async () => {
    log('--- Test: Raw response ---');
    await clickResponseTab(frame, 'raw');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'response-raw');
  });

  test('should view response logs', async () => {
    log('--- Test: Response logs ---');
    await clickResponseTab(frame, 'logs');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'response-logs');
  });
});
