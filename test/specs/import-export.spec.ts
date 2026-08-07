import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  ensureSidebarOpen,
  findCollectionsFrame,
  clickWithCursor,
  selectQuickPick,
  typeInQuickInput,
  confirmQuickInput,
  dismissNotification,
  logCheck,
  logError,
  type VSCodeApp,
} from '../utils/vscode';
import { stubOpenDialog } from '../utils/helpers';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let collectionsFrame: Frame | null = null;

function writeFixture(name: string, content: string): string {
  const p = path.join(os.tmpdir(), `restify-import-${Date.now()}-${name}`);
  fs.writeFileSync(p, content);
  return p;
}

/** Opens the sidebar Import flow, selects a source and waits for the success toast. */
async function importViaSidebar(label: string, fixturePath?: string): Promise<void> {
  const { window } = app;
  const sidebar = window.locator('.part.sidebar');
  const importBtn = sidebar.locator('.codicon-cloud-download, button[title*="Import"]').first();
  const impCount = await importBtn.count().catch(() => 0);
  logCheck('Import button in sidebar', impCount);
  expect(impCount).toBeGreaterThan(0);

  if (fixturePath) stubOpenDialog(fixturePath);
  await clickWithCursor(importBtn, { force: true });
  await window.waitForTimeout(800);
  await selectQuickPick(window, label);

  try {
    await window.waitForFunction(() => {
      const toasts = document.querySelectorAll('.notifications-toasts .notification-toast, .notification-toast');
      for (const toast of toasts) {
        if (toast.textContent?.includes('Imported')) return true;
      }
      return false;
    }, { timeout: 30_000 });
    logCheck(`Import via "${label}" succeeded`, true);
  } catch {
    logError(`Timed out waiting for import success notification (${label})`);
    throw new Error(`Import success notification did not appear for ${label}`);
  }
  await dismissNotification(window);
}

test.describe('Import / Export', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    await ensureSidebarOpen(app.window);
    collectionsFrame = await findCollectionsFrame(app.window);
    expect(collectionsFrame).not.toBeNull();
  });

  test.afterAll(async () => {
    await closeVSCode(app);
  });

  test('Import Swagger Petstore collection via URL', async () => {
    const { window } = app;

    const sidebar = window.locator('.part.sidebar');
    const importBtn = sidebar.locator('.codicon-cloud-download, button[title*="Import"]').first();
    const impCount = await importBtn.count().catch(() => 0);
    logCheck('Import button in sidebar', impCount);
    expect(impCount).toBeGreaterThan(0);

    await clickWithCursor(importBtn, { force: true });
    await window.waitForTimeout(800);
    await selectQuickPick(window, 'Swagger URL');
    await typeInQuickInput(window, 'https://petstore.swagger.io/v2/swagger.json');
    await confirmQuickInput(window);

    try {
      await window.waitForFunction(() => {
        const toasts = document.querySelectorAll('.notifications-toasts .notification-toast, .notification-toast');
        for (const toast of toasts) {
          if (toast.textContent?.includes('Imported')) return true;
        }
        return false;
      }, { timeout: 30_000 });
      logCheck('Import success notification', true);
    } catch {
      logError('Timed out waiting for import success notification');
      throw new Error('Import success notification did not appear');
    }
    await dismissNotification(window);
    await screenshot(window, 'import-swagger-imported');
  });

  test('Verify imported collection appears in sidebar', async () => {
    const frame = collectionsFrame;
    if (!frame) throw new Error('No collections frame');
    const text = (await frame.locator('body').textContent().catch(() => '')) || '';
    logCheck('Collection visible in sidebar', /Petstore|Swagger/i.test(text));
    expect(text).toMatch(/Petstore|Swagger/i);
    await screenshot(app.window, 'import-verified');
  });

  test('Export all collections via sidebar toolbar', async () => {
    const { window } = app;
    const frame = collectionsFrame;
    if (!frame) throw new Error('No collections frame');

    const exportAll = frame.locator('button[title="Export all collections"]');
    const eaCount = await exportAll.count().catch(() => 0);
    logCheck('Export-all toolbar button', eaCount);
    expect(eaCount).toBeGreaterThan(0);

    await clickWithCursor(exportAll.first(), { force: true });

    const inputBox = window.locator('.quick-input-widget .input-box input, .quick-input-widget input');
    await inputBox.first().waitFor({ state: 'visible', timeout: 10_000 });
    logCheck('Filename input box visible', true);

    await typeInQuickInput(window, 'export-test.json');
    await confirmQuickInput(window);

    try {
      await window.waitForFunction(() => {
        const toasts = document.querySelectorAll('.notifications-toasts .notification-toast, .notification-toast');
        for (const toast of toasts) {
          if (toast.textContent?.includes('Exported')) return true;
        }
        return false;
      }, { timeout: 15_000 });
      logCheck('Export success notification', true);
    } catch {
      logError('Timed out waiting for export success notification');
      throw new Error('Export success notification did not appear');
    }
    await dismissNotification(window);
    await screenshot(window, 'export-triggered');
  });

  test('Import a Postman Collection JSON file', async () => {
    const fixture = writeFixture('postman.json', JSON.stringify({
      info: { name: 'E2E Postman', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [
        {
          name: 'Get users',
          request: { method: 'GET', url: 'https://api.example.com/users?page=1', header: [{ key: 'Accept', value: 'application/json' }] },
        },
        {
          name: 'Create user',
          request: {
            method: 'POST',
            url: 'https://api.example.com/users',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: { mode: 'raw', raw: '{"name":"Ada"}' },
          },
        },
      ],
    }));
    await importViaSidebar('Postman Collection', fixture);
    const text = (await collectionsFrame!.locator('body').textContent().catch(() => '')) || '';
    logCheck('Postman collection visible in sidebar', text.includes('E2E Postman'));
    expect(text).toContain('E2E Postman');
    fs.unlinkSync(fixture);
    await screenshot(app.window, 'import-postman');
  });

  test('Import an OpenAPI / Swagger file', async () => {
    const fixture = writeFixture('openapi.json', JSON.stringify({
      openapi: '3.0.1',
      info: { title: 'E2E Pets', version: '1.0.0' },
      paths: {
        '/pets': { get: { summary: 'List pets', responses: { '200': { description: 'OK' } } } },
        '/pets/{id}': { get: { summary: 'Get pet', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      },
    }));
    await importViaSidebar('OpenAPI / Swagger File', fixture);
    const text = (await collectionsFrame!.locator('body').textContent().catch(() => '')) || '';
    logCheck('OpenAPI collection visible in sidebar', text.includes('E2E Pets'));
    expect(text).toContain('E2E Pets');
    fs.unlinkSync(fixture);
    await screenshot(app.window, 'import-openapi');
  });

  test('Import a HAR file', async () => {
    const fixture = writeFixture('capture.har', JSON.stringify({
      log: {
        version: '1.2',
        entries: [
          { startedDateTime: '2024-01-01T00:00:00Z', request: { method: 'GET', url: 'https://api.example.com/health', headers: [], queryString: [] } },
          { startedDateTime: '2024-01-01T00:00:01Z', request: { method: 'POST', url: 'https://api.example.com/items', headers: [{ name: 'Content-Type', value: 'application/json' }], queryString: [], postData: { mimeType: 'application/json', text: '{"a":1}' } } },
        ],
      },
    }));
    await importViaSidebar('HAR File', fixture);
    const text = (await collectionsFrame!.locator('body').textContent().catch(() => '')) || '';
    logCheck('HAR collection visible in sidebar', text.includes('Imported .http') || text.includes('HAR') || text.includes('Request'));
    fs.unlinkSync(fixture);
    await screenshot(app.window, 'import-har');
  });

  test('Import an Insomnia export file', async () => {
    const fixture = writeFixture('insomnia.json', JSON.stringify([
      { _type: 'request', name: 'Ping', url: 'https://api.example.com/ping', method: 'GET', headers: [] },
      { _type: 'request', name: 'Create', url: 'https://api.example.com/create', method: 'POST', headers: [] },
    ]));
    await importViaSidebar('Insomnia Export', fixture);
    const text = (await collectionsFrame!.locator('body').textContent().catch(() => '')) || '';
    logCheck('Insomnia collection visible in sidebar', text.includes('Ping'));
    expect(text).toContain('Ping');
    fs.unlinkSync(fixture);
    await screenshot(app.window, 'import-insomnia');
  });

  test('Import a Restify collection file', async () => {
    const fixture = writeFixture('restify-collection.json', JSON.stringify({
      name: 'E2E Restify Collection',
      requests: [{ id: 'r1', method: 'GET', url: 'https://api.example.com/restify', name: 'Restify req' }],
    }));
    await importViaSidebar('Restify Collection', fixture);
    const text = (await collectionsFrame!.locator('body').textContent().catch(() => '')) || '';
    logCheck('Restify collection visible in sidebar', text.includes('E2E Restify Collection'));
    expect(text).toContain('E2E Restify Collection');
    fs.unlinkSync(fixture);
    await screenshot(app.window, 'import-restify');
  });

  test('Verify all imported collections coexist in the sidebar', async () => {
    const text = (await collectionsFrame!.locator('body').textContent().catch(() => '')) || '';
    for (const name of ['E2E Postman', 'E2E Pets', 'E2E Restify Collection']) {
      logCheck(`Collection "${name}" present`, text.includes(name));
      expect(text).toContain(name);
    }
    await screenshot(app.window, 'import-all-verified');
  });
});
