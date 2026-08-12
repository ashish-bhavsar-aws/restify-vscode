import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  injectCursorOverlay,
  resetLog,
  log,
  logCheck,
  dismissNotification,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  openWebSocketClient,
  wsConnect,
  wsDisconnect,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let wsFrame: Frame | null = null;

async function expectStatus(frame: Frame, text: string, timeoutMs = 10_000): Promise<void> {
  await frame.waitForFunction(
    (t) =>
      (document.querySelector('[data-testid="ws-status"]')?.textContent || '').includes(t),
    text,
    { timeout: timeoutMs },
  );
}

async function expectLogContains(frame: Frame, text: string, timeoutMs = 10_000): Promise<void> {
  await frame.waitForFunction(
    (t) => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="ws-log-row-"]'));
      return rows.some((r) => (r.textContent || '').includes(t));
    },
    text,
    { timeout: timeoutMs },
  );
}

async function sendMessage(frame: Frame, data: string, binary = false): Promise<void> {
  await frame.locator('[data-testid="ws-message-input"]').fill(data);
  if (binary) {
    await frame.locator('[data-testid="ws-binary-toggle"]').check();
  }
  await frame.locator('[data-testid="ws-send-btn"]').click();
}

test.describe('F46 — WebSocket client (unified panel)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [WebSocket] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    wsFrame = await openWebSocketClient(app);
    log('=== [WebSocket] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [WebSocket] afterAll ===');
    await dismissNotification(app.window);
    await closeVSCode(app);
  });

  test('opens the WebSocket client panel in idle state', async () => {
    const frame = wsFrame!;
    await expect(frame.locator('[data-testid="ws-url-input"]')).toBeVisible();
    await expectStatus(frame, 'Idle');
    logCheck('WebSocket panel opened', true);
  });

  test('connects and receives a text frame pushed by the server', async () => {
    const frame = wsFrame!;
    await wsConnect(frame, 'ws://localhost:3000/ws/hello');
    await expectStatus(frame, 'Connected');
    await expectLogContains(frame, 'Hello from Restify test server');
    logCheck('received server-pushed text frame', true);
  });

  test('echoes text frames sent by the user', async () => {
    const frame = wsFrame!;
    await wsConnect(frame, 'ws://localhost:3000/ws/echo');
    await expectStatus(frame, 'Connected');
    await sendMessage(frame, 'ping from restify');
    await expectLogContains(frame, 'ping from restify');
    const outRows = await frame.locator('[data-testid="ws-log-row-out"]').allTextContents();
    const inRows = await frame.locator('[data-testid="ws-log-row-in"]').allTextContents();
    expect(outRows.some((r) => r.includes('ping from restify'))).toBe(true);
    expect(inRows.some((r) => r.includes('ping from restify'))).toBe(true);
    logCheck('text echo round-trip', true);
  });

  test('receives binary frames and displays them as hex', async () => {
    const frame = wsFrame!;
    await wsConnect(frame, 'ws://localhost:3000/ws/binary');
    await expectStatus(frame, 'Connected');
    await expectLogContains(frame, '0x000102deadbeef');
    logCheck('binary frame shown as hex', true);
  });

  test('sends a binary frame and echoes it back as binary', async () => {
    const frame = wsFrame!;
    await wsConnect(frame, 'ws://localhost:3000/ws/echo');
    await expectStatus(frame, 'Connected');
    await sendMessage(frame, 'AB', true);
    await expectLogContains(frame, '0x4142');
    const inRows = await frame.locator('[data-testid="ws-log-row-in"]').allTextContents();
    expect(inRows.some((r) => r.includes('0x4142'))).toBe(true);
    logCheck('binary send/echo round-trip', true);
  });

  test('disconnect closes the connection and shows Closed status', async () => {
    const frame = wsFrame!;
    await wsDisconnect(frame);
    await expectStatus(frame, 'Closed');
    logCheck('disconnect shows Closed status', true);
  });

  test('shows an error entry when the connection is refused', async () => {
    const frame = wsFrame!;
    await wsConnect(frame, 'ws://127.0.0.1:1/nope');
    await expectLogContains(frame, 'ECONNREFUSED');
    logCheck('refused connection logged', true);
  });
});
