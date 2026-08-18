import { test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  log,
  resetLog,
} from '../utils/vscode';
import {
  clickInFrame,
} from '../utils/vscode';
import {
  startMockServer,
  stopMockServer,
  setupMainPanel,
  wsConnect,
  wsDisconnect,
} from '../utils/helpers';

test.describe('WebSocket Client', () => {
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

  test('should switch to WebSocket mode', async () => {
    log('--- Test: Switch to WS mode ---');
    await clickInFrame(frame, '[data-testid="type-toggle-ws"]');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'ws-mode-active');
  });

  test('should connect to WebSocket echo server', async () => {
    log('--- Test: Connect to WS echo ---');
    await wsConnect(frame, 'ws://localhost:3000/ws/echo');
    await frame.waitForTimeout(2000);

    await screenshot(app.window, 'ws-connected');
  });

  test('should send a message via WebSocket', async () => {
    log('--- Test: Send WS message ---');
    const msgInput = frame.locator('[data-testid="ws-message-input"]');
    if ((await msgInput.count()) > 0) {
      await msgInput.fill('Hello WebSocket');
      await clickInFrame(frame, '[data-testid="ws-send-btn"]');
      await frame.waitForTimeout(1000);
    }

    await screenshot(app.window, 'ws-message-sent');
  });

  test('should disconnect from WebSocket', async () => {
    log('--- Test: Disconnect WS ---');
    await wsDisconnect(frame);
    await frame.waitForTimeout(1000);

    await screenshot(app.window, 'ws-disconnected');
  });

  test('should connect to WebSocket hello server', async () => {
    log('--- Test: Connect to WS hello ---');
    await clickInFrame(frame, '[data-testid="type-toggle-ws"]');
    await frame.waitForTimeout(300);
    await wsConnect(frame, 'ws://localhost:3000/ws/hello');
    await frame.waitForTimeout(2000);

    await screenshot(app.window, 'ws-hello-connected');
  });

  test('should disconnect from hello server', async () => {
    log('--- Test: Disconnect WS hello ---');
    await wsDisconnect(frame);
    await frame.waitForTimeout(1000);

    await screenshot(app.window, 'ws-hello-disconnected');
  });
});
