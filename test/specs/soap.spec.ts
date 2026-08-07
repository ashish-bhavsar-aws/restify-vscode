import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  findCollectionsFrame,
  snapshotWebviewFrameUrls,
  waitForNewMainPanelFrame,
  selectQuickPick,
  typeInQuickInput,
  confirmQuickInput,
  dismissNotification,
  clickInFrame,
  log,
  logCheck,
  logError,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  openSettings,
  setUrl,
  sendRequest,
  waitForResponse,
  getStatusCode,
  getResponseText,
  getUrl,
  stubOpenDialog,
} from '../utils/helpers';
import * as path from 'path';
import type { Frame } from '@playwright/test';

const WSDL_FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'wsdl', 'calculator.wsdl');
const SOAP_PRIVATE_KEY = path.resolve(__dirname, '..', '..', 'server', 'certs', 'soap-key.pem');
const LIVE_WSDL_URL = 'https://soap-service-free.mock.beeceptor.com/CountryInfoService?WSDL';

let app: VSCodeApp;
let mainFrame: Frame | null = null;
let collFrame: Frame | null = null;

/** Opens the sidebar Import flow and waits for the success toast. */
async function importViaSidebar(label: string, fixturePath: string): Promise<void> {
  const { window } = app;
  const sidebar = window.locator('.part.sidebar');
  const importBtn = sidebar.locator('.codicon-cloud-download, button[title*="Import"]').first();
  const impCount = await importBtn.count().catch(() => 0);
  logCheck('Import button in sidebar', impCount);
  expect(impCount).toBeGreaterThan(0);

  stubOpenDialog(fixturePath);
  await importBtn.click({ force: true });
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

/** Ensure a collapsed collection is expanded by clicking its name text (toggle-safe). */
async function expandCollection(nameSub: string, requestName: string): Promise<void> {
  const header = collFrame!.locator('[data-testid="collection-header"]').filter({ hasText: nameSub }).first();
  await header.waitFor({ state: 'visible', timeout: 10_000 });
  for (let i = 0; i < 3; i++) {
    const target = collFrame!.locator('[data-testid="collection-request"]').filter({ hasText: requestName }).first();
    if (await target.isVisible().catch(() => false)) return;
    await header.getByText(nameSub, { exact: false }).first().click();
    await collFrame!.waitForTimeout(500);
  }
}

/**
 * Ensure the collection is expanded, click a request row, and wait for the NEW
 * main panel frame that the click opens (each sidebar load opens a fresh panel),
 * so `mainFrame` always points at the panel showing the loaded request.
 */
async function loadRequest(name: string, collection: string): Promise<void> {
  await expandCollection(collection, name);
  const row = collFrame!.locator('[data-testid="collection-request"]').filter({ hasText: name }).first();
  await row.waitFor({ state: 'visible', timeout: 10_000 });

  const beforeUrls = await snapshotWebviewFrameUrls(app.window);
  let newFrame: Frame | null = null;
  try {
    await row.click({ timeout: 10_000 });
    newFrame = await waitForNewMainPanelFrame(app.window, beforeUrls, 15_000);
  } catch {
    await row.evaluate((el) => {
      (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    newFrame = await waitForNewMainPanelFrame(app.window, beforeUrls, 15_000);
  }
  expect(newFrame).not.toBeNull();
  mainFrame = newFrame;
}

test.describe('F61 — SOAP / WSDL import + WS-Security', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    log('=== [SOAP] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    collFrame = await findCollectionsFrame(app.window);
    expect(collFrame).not.toBeNull();
    log('=== [SOAP] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [SOAP] afterAll ===');
    await closeVSCode(app);
  });

  // ── Import the calculator WSDL ─────────────────────────────────

  test('F61 - import a WSDL file from the sidebar', async () => {
    await importViaSidebar('WSDL / SOAP Service', WSDL_FIXTURE);
    const text = (await collFrame!.locator('body').textContent().catch(() => '')) || '';
    logCheck('Calculator collection visible in sidebar', text.includes('CalculatorService'));
    expect(text).toContain('CalculatorService');
    logCheck('Add operation visible in sidebar', text.includes('Add'));
    expect(text).toContain('Add');
    await screenshot(app.window, 'f61-wsdl-imported');
  });

  // ── Open the SOAP request in the editor ────────────────────────

  test('F61 - open the imported SOAP operation in the editor', async () => {
    await loadRequest('Add', 'CalculatorService');

    // Loading posts the request sidebar → extension → a NEW main panel; wait for
    // the URL to actually render (auto-retrying assertion).
    await expect(mainFrame!.locator('.url-input')).toContainText('http://example.com/calc', { timeout: 15_000 });
    const url = await getUrl(mainFrame!);
    logCheck('SOAP request URL loaded', url);
    expect(url).toBe('http://example.com/calc');

    // The SOAP meta section lives inside the Body tab, which is not active by default.
    await mainFrame!.locator('[data-testid="req-tab-body"]').click();

    const opSelect = mainFrame!.locator('[data-testid="soap-operation-select"]');
    await opSelect.waitFor({ state: 'visible', timeout: 10_000 });
    const opValue = await opSelect.inputValue();
    logCheck('SOAP operation select shows Add', opValue);
    expect(opValue).toBe('Add');

    const xmlTab = mainFrame!.locator('[data-testid="body-type-xml"]');
    logCheck('XML body type tab rendered', (await xmlTab.count()) > 0);
    expect(await xmlTab.count()).toBeGreaterThan(0);
    await screenshot(app.window, 'f61-soap-request-loaded');
  });

  // ── Send the SOAP request and verify SOAP headers ──────────────

  test('F61 - send the SOAP request to the capture endpoint', async () => {
    await setUrl(mainFrame!, mockUrl('/api/soap/capture'));
    await mainFrame!.waitForTimeout(300);
    await sendRequest(mainFrame!);
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('SOAP request status', status);
    expect(status).toBe('200');

    const body = await getResponseText(mainFrame!);
    logCheck('Captured method is POST', body.includes('"method": "POST"'));
    expect(body).toContain('"method": "POST"');
    logCheck('Raw XML body captured', body.includes('<tns:Add>'));
    expect(body).toContain('<tns:Add>');
    logCheck('SOAPAction header captured', body.includes('soapaction'));
    expect(body).toContain('soapaction');
    logCheck('SOAPAction value captured', body.includes('http://example.com/calc/Add'));
    expect(body).toContain('http://example.com/calc/Add');
    await screenshot(app.window, 'f61-soap-captured');
  });

  // ── WS-Security: decrypt the encrypted response via settings ───

  test('F61 - WS-Security decrypts an encrypted SOAP response from settings', async () => {
    await setUrl(mainFrame!, mockUrl('/api/soap/encrypted'));
    await mainFrame!.waitForTimeout(300);

    // No WS-Security settings configured → the encrypted response is shown as-is.
    await sendRequest(mainFrame!);
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Encrypted endpoint status (no settings)', status);
    expect(status).toBe('200');

    const encBody = await getResponseText(mainFrame!);
    const isEncrypted = encBody.includes('EncryptedData') || encBody.includes('CipherValue');
    logCheck('Response shown encrypted without a decrypt keystore', isEncrypted);
    expect(isEncrypted).toBe(true);

    // Configure a settings entry: hostname localhost, Decrypt Response, PEM keystore.
    await openSettings(mainFrame!);
    await clickInFrame(mainFrame!, '[data-testid="settings-tab-soap"]');
    await mainFrame!.waitForTimeout(300);
    await mainFrame!.locator('[data-testid="soap-add-hostname"]').fill('localhost');
    await mainFrame!.locator('[data-testid="soap-add-decrypt"]').check();
    await mainFrame!.waitForTimeout(200);
    await mainFrame!.locator('[data-testid="soap-add-keystore"]').selectOption('pem');
    await mainFrame!.waitForTimeout(200);
    await mainFrame!.locator('[data-testid="soap-add-key"]').fill(SOAP_PRIVATE_KEY);
    await clickInFrame(mainFrame!, '[data-testid="soap-entry-add"]');
    await mainFrame!.waitForTimeout(300);
    const entryCount = await mainFrame!.locator('[data-testid="soap-entry"]').count();
    logCheck('SOAP security entry added in settings', entryCount > 0);
    expect(entryCount).toBeGreaterThan(0);
    await clickInFrame(mainFrame!, '[data-testid="settings-save-btn"]');
    await mainFrame!.waitForTimeout(400);

    // With valid decryption material in settings, the response is decrypted.
    await sendRequest(mainFrame!);
    const ok2 = await waitForResponse(mainFrame!, 20_000);
    expect(ok2).toBe(true);
    const status2 = await getStatusCode(mainFrame!);
    logCheck('Encrypted endpoint status (with settings)', status2);
    expect(status2).toBe('200');

    const body = await getResponseText(mainFrame!);
    logCheck('Encrypted response was decrypted', body.includes('AddResponse'));
    expect(body).toContain('AddResponse');
    logCheck('Decrypted payload contains sum', body.includes('3'));
    expect(body).toContain('3');
    await screenshot(app.window, 'f61-ws-security-decrypted');
  });

  // ── Live WSDL URL import + operation calls ─────────────────────

  test('F61 - import the CountryInfoService WSDL from a URL', async () => {
    const { window } = app;
    const sidebar = window.locator('.part.sidebar');
    const importBtn = sidebar.locator('.codicon-cloud-download, button[title*="Import"]').first();
    await importBtn.click({ force: true });
    await window.waitForTimeout(800);
    await selectQuickPick(window, 'WSDL / SOAP Service URL');
    await typeInQuickInput(window, LIVE_WSDL_URL);
    await confirmQuickInput(window);

    try {
      await window.waitForFunction(() => {
        const toasts = document.querySelectorAll('.notifications-toasts .notification-toast, .notification-toast');
        for (const toast of toasts) {
          if (toast.textContent?.includes('Imported')) return true;
        }
        return false;
      }, { timeout: 30_000 });
      logCheck('WSDL URL import succeeded', true);
    } catch {
      logError('Timed out waiting for WSDL URL import notification');
      throw new Error('WSDL URL import notification did not appear');
    }
    await dismissNotification(window);

    const text = (await collFrame!.locator('body').textContent().catch(() => '')) || '';
    logCheck('CountryInfo operations visible in sidebar', text.includes('ListOfContinentsByName'));
    expect(text).toContain('ListOfContinentsByName');
    await screenshot(app.window, 'f61-wsdl-url-imported');
  });

  test('F61 - call ListOfContinentsByName against the live service', async () => {
    await loadRequest('ListOfContinentsByName', 'CountryInfoService');
    await expect(mainFrame!.locator('.url-input')).toContainText('CountryInfoService.wso', { timeout: 15_000 });
    await mainFrame!.locator('[data-testid="req-tab-body"]').click();
    await mainFrame!.locator('[data-testid="soap-operation-select"]').waitFor({ state: 'visible', timeout: 10_000 });

    await sendRequest(mainFrame!);
    const ok = await waitForResponse(mainFrame!, 30_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Live SOAP status', status);
    expect(status).toBe('200');

    const body = await getResponseText(mainFrame!);
    logCheck('Live response contains continents', body.includes('Africa') && body.includes('Europe'));
    expect(body).toContain('Africa');
    expect(body).toContain('Europe');
    await screenshot(app.window, 'f61-live-continents');
  });

  test('F61 - call ListOfCountryNamesByName against the live service', async () => {
    await loadRequest('ListOfCountryNamesByName', 'CountryInfoService');
    await expect(mainFrame!.locator('.url-input')).toContainText('CountryInfoService.wso', { timeout: 15_000 });
    await mainFrame!.locator('[data-testid="req-tab-body"]').click();
    await mainFrame!.locator('[data-testid="soap-operation-select"]').waitFor({ state: 'visible', timeout: 10_000 });

    await sendRequest(mainFrame!);
    const ok = await waitForResponse(mainFrame!, 30_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Live SOAP status', status);
    expect(status).toBe('200');

    const body = await getResponseText(mainFrame!);
    logCheck('Live response contains country codes', body.includes('sISOCode'));
    expect(body).toContain('sISOCode');
    await screenshot(app.window, 'f61-live-countries');
  });
});
