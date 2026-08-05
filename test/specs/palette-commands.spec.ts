import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  injectCursorOverlay,
  runCommand,
  typeInQuickInput,
  confirmQuickInput,
  findMainPanelFrame,
  findCollectionsFrame,
  logCheck,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  setUrl,
  getUrl,
  waitForResponse,
  getStatusCode,
  clearDialogStub,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Command Palette Actions (F54)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await startMockServer();
    clearDialogStub();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
  });

  test.afterAll(async () => {
    clearDialogStub();
    await closeVSCode(app);
  });

  test('Send Request palette command sends the active request', async () => {
    const { window } = app;
    await setUrl(mainFrame!, mockUrl('/api/echo'));
    await runCommand(window, 'Restify: Send Request');

    const got = await waitForResponse(mainFrame!, 15_000);
    const status = await getStatusCode(mainFrame!).catch(() => '');
    logCheck('Response received after palette send', got && status.length > 0);
    expect(status).toContain('200');
  });

  test('Search in Collections palette command filters the collections view', async () => {
    const { window } = app;
    await runCommand(window, 'Restify: Search in Collections');
    await window.waitForTimeout(500);
    await typeInQuickInput(window, 'petstore');
    await confirmQuickInput(window);
    await window.waitForTimeout(1000);

    const collFrame = await findCollectionsFrame(window);
    expect(collFrame).not.toBeNull();
    if (!collFrame) return;
    const searchValue = await collFrame
      .locator('input[placeholder="Filter..."]')
      .first()
      .inputValue()
      .catch(() => '');
    logCheck('Collections search input set', searchValue);
    expect(searchValue).toBe('petstore');
  });

  test('Paste cURL palette command loads a request from clipboard', async () => {
    const { window, electronApp } = app;
    const curl =
      "curl -X POST http://localhost:3000/api/echo -H 'Content-Type: application/json' -d '{\"name\":\"restify\"}'";
    await electronApp.evaluate(({ clipboard }, text) => clipboard.writeText(text), curl);
    await window.waitForTimeout(500);

    await runCommand(window, 'Restify: Paste cURL');
    await window.waitForTimeout(500);
    await confirmQuickInput(window);
    await window.waitForTimeout(1500);

    const frame = await findMainPanelFrame(window);
    expect(frame).not.toBeNull();
    if (!frame) return;
    const url = await getUrl(frame).catch(() => '');
    logCheck('Main panel URL after cURL import', url);
    expect(url).toContain('/api/echo');
  });
});
