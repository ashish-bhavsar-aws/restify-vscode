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
  clickResponseTab,
  enableRequestChaining,
} from '../utils/helpers';

test.describe('Pre-request and Test Assertion Scripts', () => {
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

  test('should open pre-request script tab', async () => {
    log('--- Test: Open script tab ---');
    await clickRequestTab(frame, 'script');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'scripts-tab-open');
  });

  test('should write a pre-request script that sets a variable', async () => {
    log('--- Test: Write pre-request script ---');
    await clickRequestTab(frame, 'script');
    await frame.waitForTimeout(300);

    const textarea = frame.locator('textarea').first();
    if ((await textarea.count()) > 0) {
      await textarea.click();
      await textarea.press('Meta+A');
      await textarea.fill('set("scriptTestVar", "hello-from-script");');
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'scripts-pre-request-written');
  });

  test('should send request with pre-request script active', async () => {
    log('--- Test: Send request with pre-script ---');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'scripts-request-with-pre-script');
  });

  test('should write a test assertion script', async () => {
    log('--- Test: Write test assertion script ---');
    await clickRequestTab(frame, 'script');
    await frame.waitForTimeout(300);

    const textarea = frame.locator('textarea').first();
    if ((await textarea.count()) > 0) {
      await textarea.click();
      await textarea.press('Meta+A');
      await textarea.fill(
        'pm.test("status is 200", () => { pm.expect(pm.response.code).to.equal(200); });\npm.test("body has method", () => { pm.expect(pm.response.text()).to.include("GET"); });'
      );
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'scripts-test-assertions-written');
  });

  test('should execute test assertions and show results', async () => {
    log('--- Test: Execute test assertions ---');
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await clickResponseTab(frame, 'tests');
    await frame.waitForTimeout(500);

    const testPane = frame.locator('#res-pane');
    const text = await testPane.textContent();
    expect(text).toBeTruthy();

    await screenshot(app.window, 'scripts-test-results');
  });

  test('should show pass/fail badges in tests tab', async () => {
    log('--- Test: Test result badges ---');
    await clickResponseTab(frame, 'tests');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'scripts-test-badges');
  });
});
