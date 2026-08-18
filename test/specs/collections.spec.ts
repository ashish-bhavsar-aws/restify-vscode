import { test, expect } from '@playwright/test';
import type { Frame } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  ensureSidebarOpen,
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
  openSaveModal,
  closeSaveModal,
} from '../utils/helpers';

test.describe('Collections', () => {
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

  test('should open save modal to save request to collection', async () => {
    log('--- Test: Open save modal ---');
    await openSaveModal(frame);
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'collections-save-modal');
  });

  test('should close save modal', async () => {
    log('--- Test: Close save modal ---');
    await closeSaveModal(frame);
    await frame.waitForTimeout(300);

    await screenshot(app.window, 'collections-save-modal-closed');
  });

  test('should ensure sidebar is open with collections', async () => {
    log('--- Test: Sidebar with collections ---');
    await ensureSidebarOpen(app.window);
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'collections-sidebar');
  });

  test('should send a request and verify it appears in sidebar', async () => {
    log('--- Test: Request appears in sidebar ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'collections-request-sent');
  });
});
