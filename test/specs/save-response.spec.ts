import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  launchVSCode,
  closeVSCode,
  injectCursorOverlay,
  clickInFrame,
  resetLog,
  log,
  logCheck,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  setUrlAndSend,
  waitForResponse,
  stubSaveDialog,
  clearDialogStub,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

const SAVED_FILE = path.join(os.tmpdir(), 'restify-save-response-test.json');

async function waitForFile(file: string, timeout = 10_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fs.existsSync(file)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

test.describe('F25 — Save response body to file', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [SaveResponse] beforeAll ===');
    if (fs.existsSync(SAVED_FILE)) fs.unlinkSync(SAVED_FILE);
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [SaveResponse] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [SaveResponse] afterAll ===');
    clearDialogStub();
    if (fs.existsSync(SAVED_FILE)) fs.unlinkSync(SAVED_FILE);
    await closeVSCode(app);
  });

  test('saves the response body to disk via the save dialog', async () => {
    log('--- save response: JSON body ---');
    const frame = mainFrame!;

    await setUrlAndSend(frame, mockUrl('/api/json-response'));
    const gotResponse = await waitForResponse(frame, 20_000);
    logCheck('got response', gotResponse);
    expect(gotResponse).toBe(true);

    stubSaveDialog(SAVED_FILE);
    await clickInFrame(frame, '[data-testid="save-response-btn"]');
    await frame.waitForTimeout(500);

    const saved = await waitForFile(SAVED_FILE);
    logCheck('saved file exists', saved);
    expect(saved).toBe(true);

    const content = fs.readFileSync(SAVED_FILE, 'utf8');
    logCheck('file contains users', content.includes('users') && content.includes('Alice') && content.includes('Bob'));
    const parsed = JSON.parse(content);
    expect(parsed.users).toBeDefined();
    expect(parsed.users[0].name).toBe('Alice');
    expect(parsed.users[1].name).toBe('Bob');
  });
});
