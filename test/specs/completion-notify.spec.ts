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
  mockUrl,
  setupMainPanel,
  setUrlAndSend,
  waitForResponse,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

const THRESHOLD_ENV = 'RESTIFY_TEST_NOTIFY_THRESHOLD_MS';

test.describe('F30 — Completion notification for long requests', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [CompletionNotify] beforeAll ===');
    process.env[THRESHOLD_ENV] = '500';
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [CompletionNotify] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [CompletionNotify] afterAll ===');
    delete process.env[THRESHOLD_ENV];
    await dismissNotification(app.window);
    await closeVSCode(app);
  });

  test('shows a notification when a request exceeds the threshold', async () => {
    log('--- completion notify: long request ---');
    const frame = mainFrame!;
    const { window } = app;

    await window.evaluate(() => {
      const w = window as any;
      w.__toastLog = [];
      const obs = new MutationObserver(() => {
        const t = document.querySelector('.notification-toast-container, .notification-toast, .notification-list-item');
        if (t && (t.textContent || '').includes('Request completed')) {
          w.__toastLog.push((t.textContent || '').slice(0, 150));
        }
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    await setUrlAndSend(frame, mockUrl('/api/slow?ms=1200'));
    const gotResponse = await waitForResponse(frame, 20_000);
    logCheck('got response', gotResponse);
    expect(gotResponse).toBe(true);

    await window.waitForTimeout(3000);
    const toastLog = await window.evaluate(() => (window as any).__toastLog || []);
    logCheck('completion notification appeared', toastLog.length > 0);
    expect(toastLog.length).toBeGreaterThan(0);

    await dismissNotification(window);
  });
});
