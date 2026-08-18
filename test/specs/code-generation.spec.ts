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
  setMethod,
  setBodyType,
  fillBody,
  openCodegen,
  closeCodegen,
  addHeader,
} from '../utils/helpers';

test.describe('Code Generation', () => {
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

  test('should send a request first to have data for codegen', async () => {
    log('--- Test: Send request for codegen ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'json');
    await fillBody(frame, JSON.stringify({ name: 'codegen-test', value: 42 }, null, 2));
    await addHeader(frame, 'Content-Type', 'application/json');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'codegen-request-sent');
  });

  test('should open code generation modal', async () => {
    log('--- Test: Open codegen modal ---');
    await openCodegen(frame);
    await frame.waitForTimeout(500);

    const modal = frame.locator('[data-testid="codegen-modal"]');
    const count = await modal.count();
    expect(count).toBeGreaterThan(0);

    await screenshot(app.window, 'codegen-modal-open');
  });

  test('should display code generation content', async () => {
    log('--- Test: Codegen content ---');
    const modal = frame.locator('[data-testid="codegen-modal"]');
    const text = await modal.textContent();
    expect(text).toBeTruthy();

    await screenshot(app.window, 'codegen-content');
  });

  test('should close code generation modal', async () => {
    log('--- Test: Close codegen modal ---');
    await closeCodegen(frame);
    await frame.waitForTimeout(300);

    await screenshot(app.window, 'codegen-modal-closed');
  });

  test('should open codegen for GET request', async () => {
    log('--- Test: Codegen for GET ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await openCodegen(frame);
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'codegen-get-request');

    await closeCodegen(frame);
  });
});
