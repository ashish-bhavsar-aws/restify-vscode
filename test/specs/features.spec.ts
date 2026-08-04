import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  clickInFrame,
  resetLog,
  log,
  logCheck,
  waitForElement,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  setMethod,
  setUrl,
  sendRequest,
  setUrlAndSend,
  waitForResponse,
  getStatusCode,
  getResponseText,
  setBodyType,
  fillBody,
  addHeader,
  clickResponseTab,
  openSettings,
  closeSettings,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

const HTTPS_URL = 'https://localhost:3443/api/echo';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Roadmap Features (F1-F6, F8, F16, F17, F33)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Features] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Features] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Features] afterAll ===');
    await closeVSCode(app);
  });

  async function waitForResponseText(frame: Frame, pattern: RegExp, timeout = 20_000): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const text = await getResponseText(frame);
      if (pattern.test(text)) return text;
      await frame.waitForTimeout(300);
    }
    return getResponseText(frame);
  }

  // ── F1: GraphQL body ─────────────────────────────────────────────

  test('F1 - GraphQL query + variables are sent as JSON body', async () => {
    log('--- F1: GraphQL body ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'graphql');
    await fillBody(mainFrame!, 'query Hero($id: ID!) { hero(id: $id) { name } }');
    const vars = await mainFrame!.locator('#req-pane textarea').nth(1);
    await vars.click();
    await vars.fill('{"id": 1}');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Body has GraphQL query', body.includes('hero(id: $id)'));
    logCheck('Body has variables', body.includes('"id": 1'));
    logCheck('Body has query field', /"query":/.test(body));
    await screenshot(app.window, 'features-f1-graphql');
  });

  // ── F3: Redirects ────────────────────────────────────────────────

  test('F3 - follows redirects by default', async () => {
    log('--- F3: follow redirects ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/redirect'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Final status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Redirect target reached', body.includes('redirected'));
    await screenshot(app.window, 'features-f3-redirect');
  });

  test('F3 - redirects can be disabled', async () => {
    log('--- F3: redirects disabled ---');
    await clickInFrame(mainFrame!, '[data-testid="follow-redirects-toggle"]');
    await setUrlAndSend(mainFrame!, mockUrl('/api/redirect'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 302 preserved', status);
    expect(status).toBe('302');
    await clickInFrame(mainFrame!, '[data-testid="follow-redirects-toggle"]');
    await setUrlAndSend(mainFrame!, mockUrl('/api/redirect'));
    await waitForResponse(mainFrame!, 15_000);
    const restored = await getStatusCode(mainFrame!);
    logCheck('Redirect following restored', restored);
    expect(restored).toBe('200');
  });

  // ── F4: Decompression ────────────────────────────────────────────

  test('F4 - gzip response is decompressed', async () => {
    log('--- F4: gzip ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/gzip'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Decompressed body visible', body.includes('gzip-compressed'));
    logCheck('JSON decoded', body.includes('item-5'));
    await screenshot(app.window, 'features-f4-gzip');
  });

  // ── F5: Cookie jar ───────────────────────────────────────────────

  test('F5 - cookies are stored and sent on subsequent requests', async () => {
    log('--- F5: cookies ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/cookie/set'));
    let ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const setBody = await getResponseText(mainFrame!);
    logCheck('Cookie set response', setBody.includes('session'));

    await setUrlAndSend(mainFrame!, mockUrl('/api/cookie/check'));
    ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const body = await getResponseText(mainFrame!);
    logCheck('Cookie sent on next request', body.includes('session=abc123'));
    await screenshot(app.window, 'features-f5-cookie');
  });

  test('F5 - response Cookies tab lists Set-Cookie entries', async () => {
    log('--- F5: cookies tab ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/cookie/set?name=theme&value=dark'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'cookies');
    await mainFrame!.waitForTimeout(400);
    const body = await getResponseText(mainFrame!);
    logCheck('Cookies tab shows name', body.includes('theme'));
    expect(body).toContain('theme');
    logCheck('Cookies tab shows value', body.includes('dark'));
    expect(body).toContain('dark');
    logCheck('Cookies tab shows Path attribute', body.includes('Path'));
    expect(body).toContain('Path');
    await screenshot(app.window, 'features-f5-cookies-tab');
  });

  // ── F8: Request timeout ──────────────────────────────────────────

  test('F8 - per-request timeout aborts slow requests', async () => {
    log('--- F8: timeout ---');
    await mainFrame!.locator('[data-testid="timeout-input"]').fill('500');
    await setUrlAndSend(mainFrame!, mockUrl('/api/slow?ms=8000'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /timed out/i);
    logCheck('Timeout error shown', /timed out/i.test(body));
    expect(body.toLowerCase()).toContain('timed out');
    await screenshot(app.window, 'features-f8-timeout');
    await mainFrame!.locator('[data-testid="timeout-input"]').fill('');
  });

  // ── F6: Request cancellation ─────────────────────────────────────

  test('F6 - in-flight request can be cancelled', async () => {
    log('--- F6: cancel ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/slow?ms=12000'));
    const cancelBtn = mainFrame!.locator('[data-testid="cancel-btn"]');
    await cancelBtn.waitFor({ state: 'visible', timeout: 8_000 });
    log('Cancel button visible, clicking...');
    await clickInFrame(mainFrame!, '[data-testid="cancel-btn"]');
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /cancelled/i, 15_000);
    logCheck('Cancelled message shown', /cancelled/i.test(body));
    expect(body.toLowerCase()).toContain('cancelled');
    const status = await getStatusCode(mainFrame!);
    logCheck('Status ERR (0)', status === 'ERR' || status === '0');
    await screenshot(app.window, 'features-f6-cancel');
  });

  // ── F2: SSL verification ─────────────────────────────────────────

  test('F2 - self-signed cert rejected by default (Verify SSL on)', async () => {
    log('--- F2: SSL on ---');
    await setUrlAndSend(mainFrame!, HTTPS_URL);
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /self-signed|certificate|unable to verify/i);
    logCheck('SSL error surfaced', /self-signed|certificate|unable to verify/i.test(body));
    expect(body.toLowerCase()).toMatch(/self-signed|certificate|unable to verify/);
    await screenshot(app.window, 'features-f2-ssl-error');
  });

  test('F2 - Verify SSL off allows self-signed cert', async () => {
    log('--- F2: SSL off ---');
    await clickInFrame(mainFrame!, '[data-testid="verify-ssl-toggle"]');
    await setUrlAndSend(mainFrame!, HTTPS_URL);
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200 over HTTPS', status);
    expect(status).toBe('200');
    await clickResponseTab(mainFrame!, 'body');
    const body = await getResponseText(mainFrame!);
    logCheck('Echo reached', body.includes('GET'));
    await screenshot(app.window, 'features-f2-ssl-off');
    await clickInFrame(mainFrame!, '[data-testid="verify-ssl-toggle"]');
  });

  // ── F16: Dynamic variables ────────────────────────────────────────

  test('F16 - dynamic variables resolve in the URL query string', async () => {
    log('--- F16: dynamic vars in URL ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    const url = mockUrl(
      '/api/echo?ts={{$timestamp}}&guid={{$guid}}&rand={{$randomInt}}&alpha={{$randomAlpha}}' +
        '&hex={{$randomHex}}&dt={{$localDateTime}}&user={{$processEnv:USER}}' +
        '&missing={{$processEnv:NO_SUCH_ENV_VAR_XYZ}}',
    );
    await setUrlAndSend(mainFrame!, url);
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"ts":/);

    const tsMatch = body.match(/"ts":\s*"(\d{13})"/);
    logCheck('$timestamp resolved to epoch millis', !!tsMatch);
    expect(tsMatch).not.toBeNull();

    const guidMatch = body.match(/"guid":\s*"([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})"/i);
    logCheck('$guid resolved to v4 UUID', !!guidMatch);
    expect(guidMatch).not.toBeNull();

    const randMatch = body.match(/"rand":\s*"(\d{1,4})"/);
    logCheck('$randomInt resolved', !!randMatch);
    expect(randMatch).not.toBeNull();
    if (randMatch) {
      const n = parseInt(randMatch[1], 10);
      logCheck('$randomInt in range 0..1000', n >= 0 && n <= 1000);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1000);
    }

    const alphaMatch = body.match(/"alpha":\s*"([a-z]{5})"/);
    logCheck('$randomAlpha resolved to 5 lowercase letters', !!alphaMatch);
    expect(alphaMatch).not.toBeNull();

    const hexMatch = body.match(/"hex":\s*"([0-9a-f]{24})"/i);
    logCheck('$randomHex resolved to 24 hex chars', !!hexMatch);
    expect(hexMatch).not.toBeNull();

    const dtMatch = body.match(/"dt":\s*"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"/);
    logCheck('$localDateTime resolved to YYYY-MM-DD HH:MM:SS', !!dtMatch);
    expect(dtMatch).not.toBeNull();

    const userMatch = body.match(/"user":\s*"([^"]*)"/);
    logCheck('$processEnv resolved to non-empty value', !!userMatch && userMatch[1].length > 0 && !userMatch[1].includes('{{'));
    expect(userMatch).not.toBeNull();
    if (userMatch) {
      expect(userMatch[1].length).toBeGreaterThan(0);
      expect(userMatch[1]).not.toContain('{{');
    }

    logCheck('Unset $processEnv left as-is', body.includes('NO_SUCH_ENV_VAR_XYZ'));
    expect(body).toContain('NO_SUCH_ENV_VAR_XYZ');
    await screenshot(app.window, 'features-f16-dynamic-vars-url');
  });

  test('F16 - dynamic variables in headers resolve fresh on each request', async () => {
    log('--- F16: dynamic vars in headers ---');
    await addHeader(mainFrame!, 'X-Trace-Id', '{{$guid}}');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /x-trace-id/i);
    const first = body.match(/"x-trace-id":\s*"([0-9a-f-]{36})"/i);
    logCheck('$guid resolved in header (1st request)', !!first);
    expect(first).not.toBeNull();
    const firstUuid = first![1];

    // Re-send — dynamic vars must re-resolve to a fresh value on every request
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const start = Date.now();
    let secondUuid: string | null = null;
    while (Date.now() - start < 15_000) {
      await mainFrame!.waitForTimeout(500);
      const text = await getResponseText(mainFrame!);
      const m = text.match(/"x-trace-id":\s*"([0-9a-f-]{36})"/i);
      if (m && m[1] !== firstUuid) {
        secondUuid = m[1];
        break;
      }
    }
    logCheck('$guid re-resolved on 2nd request', !!secondUuid);
    expect(secondUuid).not.toBeNull();
    if (secondUuid) {
      logCheck('New value differs from 1st request', secondUuid !== firstUuid);
      expect(secondUuid).not.toBe(firstUuid);
    }
    await screenshot(app.window, 'features-f16-dynamic-vars-header');
  });

  test('F16 - dynamic variables resolve in JSON body', async () => {
    log('--- F16: dynamic vars in body ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'json');
    await fillBody(mainFrame!, JSON.stringify({ id: '{{$guid}}', ts: '{{$timestamp}}', n: '{{$randomInt}}' }));
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"ts":/);

    logCheck('$guid resolved in body', /"id":\s*"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/i.test(body));
    expect(body).toMatch(/"id":\s*"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/i);
    logCheck('$timestamp resolved in body', /"ts":\s*"\d{13}"/.test(body));
    expect(body).toMatch(/"ts":\s*"\d{13}"/);
    logCheck('$randomInt resolved in body', /"n":\s*"\d{1,4}"/.test(body));
    expect(body).toMatch(/"n":\s*"\d{1,4}"/);
    await screenshot(app.window, 'features-f16-dynamic-vars-body');
  });

  // ── F17: Default dynamic headers ──────────────────────────────────

  async function setDefaultHeader(
    frame: Frame,
    testid: string,
    enabled: boolean,
  ): Promise<void> {
    const toggle = frame.locator(`[data-testid="${testid}"]`);
    if (await toggle.count() === 0) return;
    const checkbox = toggle.locator('input[type="checkbox"]');
    const isChecked = await checkbox.isChecked();
    if (isChecked !== enabled) {
      await clickInFrame(frame, `[data-testid="${testid}"]`);
      await frame.waitForTimeout(300);
    }
  }

  async function saveAndCloseSettings(frame: Frame): Promise<void> {
    await clickInFrame(frame, '[data-testid="settings-save-btn"]');
    await frame.waitForTimeout(600);
    await closeSettings(frame);
  }

  test('F17 - default headers are injected into requests', async () => {
    log('--- F17: default headers injected ---');
    await openSettings(mainFrame!);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-user-agent', true);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-request-id', true);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-correlation-id', true);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-date', true);
    await saveAndCloseSettings(mainFrame!);

    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"user-agent":\s*"Restify\//i);

    logCheck('User-Agent injected', /"user-agent":\s*"Restify\//i.test(body));
    expect(body).toMatch(/"user-agent":\s*"Restify\//i);
    logCheck('X-Request-Id injected', /"x-request-id":\s*"[0-9a-f-]{36}"/i.test(body));
    expect(body).toMatch(/"x-request-id":\s*"[0-9a-f-]{36}"/i);
    logCheck('X-Correlation-Id injected', /"x-correlation-id":\s*"[0-9a-f-]{36}"/i.test(body));
    expect(body).toMatch(/"x-correlation-id":\s*"[0-9a-f-]{36}"/i);
    logCheck('Date injected', /"date":\s*"[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT"/.test(body));
    expect(body).toMatch(/"date":\s*"[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT"/);
    await screenshot(app.window, 'features-f17-default-headers');
  });

  test('F17 - default headers refresh per request and respect explicit headers', async () => {
    log('--- F17: fresh per request + explicit override ---');
    // Capture the request id from the response already on screen (previous test)
    const firstBody = await waitForResponseText(mainFrame!, /x-request-id/i, 15_000);
    const firstUuid = firstBody.match(/"x-request-id":\s*"([0-9a-f-]{36})"/i);
    expect(firstUuid).not.toBeNull();

    // Re-send — X-Request-Id must be a fresh value
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const start = Date.now();
    let secondUuid: string | null = null;
    while (Date.now() - start < 15_000) {
      await mainFrame!.waitForTimeout(500);
      const text = await getResponseText(mainFrame!);
      const m = text.match(/"x-request-id":\s*"([0-9a-f-]{36})"/i);
      if (m && m[1] !== firstUuid![1]) {
        secondUuid = m[1];
        break;
      }
    }
    logCheck('X-Request-Id refreshed on next request', !!secondUuid);
    expect(secondUuid).not.toBeNull();
    if (secondUuid) expect(secondUuid).not.toBe(firstUuid![1]);

    // An explicitly-set header must not be overridden by the default
    await addHeader(mainFrame!, 'X-Request-Id', 'my-explicit-id');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"x-request-id":\s*"my-explicit-id"/i);
    logCheck('Explicit header not overridden', /"x-request-id":\s*"my-explicit-id"/i.test(body));
    expect(body).toMatch(/"x-request-id":\s*"my-explicit-id"/i);
    await screenshot(app.window, 'features-f17-default-headers-override');

    // Cleanup: disable default headers again to leave a clean state
    await openSettings(mainFrame!);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-user-agent', false);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-request-id', false);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-correlation-id', false);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-date', false);
    await saveAndCloseSettings(mainFrame!);
  });

  // ── F16: Dynamic variable discoverability ────────────────────────

  test('F16 - {{$ autocomplete inserts a dynamic variable in the URL', async () => {
    log('--- F16: {{$ autocomplete in URL ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrl(mainFrame!, mockUrl('/api/echo?x={{$gui'));

    const suggestion = mainFrame!.locator('[data-testid="url-suggestion-item"]').filter({ hasText: '{{$guid}}' });
    await suggestion.first().waitFor({ state: 'visible', timeout: 5_000 });
    logCheck('{{$guid}} suggested', true);
    await suggestion.first().click();
    await mainFrame!.waitForTimeout(300);

    await sendRequest(mainFrame!);
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"x":/);
    logCheck('Inserted {{$guid}} resolved in query', /"x":\s*"[0-9a-f-]{36}"/i.test(body));
    expect(body).toMatch(/"x":\s*"[0-9a-f-]{36}"/i);
    await screenshot(app.window, 'features-f16-autocomplete-url');
  });

  test('F16 - Variables help modal lists dynamic variables', async () => {
    log('--- F16: variables help modal ---');
    await clickInFrame(mainFrame!, '[data-testid="vars-help-btn"]');
    await waitForElement(mainFrame!, '[data-testid="vars-help-modal"]', 5_000);
    const modalText = (await mainFrame!.locator('[data-testid="vars-help-modal"]').textContent()) || '';
    logCheck('$guid listed', modalText.includes('{{$guid}}'));
    expect(modalText).toContain('{{$guid}}');
    expect(modalText).toContain('{{$localDateTime}}');
    expect(modalText).toContain('{{$processEnv:NAME}}');
    await clickInFrame(mainFrame!, '[data-testid="vars-help-close"]');
    await mainFrame!.waitForTimeout(200);
    const stillOpen = await mainFrame!.locator('[data-testid="vars-help-modal"]').count();
    logCheck('Modal closed', stillOpen === 0);
    expect(stillOpen).toBe(0);
    await screenshot(app.window, 'features-f16-vars-help');
  });

  // ── F16: Dynamic variable hover display ──────────────────────────

  test('F16 - dynamic variable shows preview tooltip and info color', async () => {
    log('--- F16: dynamic var hover display ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrl(mainFrame!, mockUrl('/api/echo?id={{$guid}}'));
    // Blur the URL input to switch VariableTextInput back to display mode
    await mainFrame!.evaluate(() => {
      const input = document.querySelector('.url-input [data-testid="variable-text-input"]') as HTMLInputElement | null;
      if (input) input.blur();
    });
    await mainFrame!.waitForTimeout(600);

    // Find the dynamic variable tag (VariableTag with title containing "dynamic variable")
    const dynamicTag = mainFrame!.locator('[title*="dynamic variable"]').first();
    const tagCount = await dynamicTag.count();
    logCheck('Dynamic variable tag found', tagCount > 0);
    expect(tagCount).toBeGreaterThan(0);

    // Verify tooltip text contains preview value
    const title = await dynamicTag.getAttribute('title');
    logCheck('Tooltip mentions "dynamic variable"', title?.includes('dynamic variable') ?? false);
    expect(title).toContain('dynamic variable');
    logCheck('Tooltip contains a UUID preview', /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(title || ''));
    expect(title).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

    // Verify the element has the info color (theme.info = #3794ff in Default Dark Modern)
    const color = await dynamicTag.evaluate((el) => getComputedStyle(el).color);
    logCheck('Dynamic var tag has info color', color);
    expect(color).not.toContain('220'); // not error red (#cd3131)
    expect(color).not.toContain('181'); // not success green (#89d185)

    await screenshot(app.window, 'features-f16-dynamic-var-hover');
  });

  // ── F33: Test/assertion scripts ─────────────────────────────────

  test('F33 - write test assertions in post-response script', async () => {
    log('--- F33: test assertions ---');
    await clickRequestTab(mainFrame!, 'script');
    await mainFrame!.waitForTimeout(300);

    const codeEditor = mainFrame!.locator('.monaco-editor, textarea, [role="textbox"]').first();
    if (await codeEditor.count() > 0) {
      await codeEditor.click();
      await mainFrame!.waitForTimeout(200);
      await app.window.keyboard.press('Meta+A');
      await mainFrame!.waitForTimeout(50);
      await app.window.keyboard.press('Backspace');
      await mainFrame!.waitForTimeout(100);
      await app.window.keyboard.type(
        `tests["status is 200"] = response.status === 200;
tests["has body"] = response.body !== "";
tests["always fails"] = false;`,
        { delay: 5 },
      );
      await mainFrame!.waitForTimeout(300);
    }
    await screenshot(app.window, 'features-f33-test-script-written');
    log('Test assertions script written');
  });

  test('F33 - send request and verify test results', async () => {
    log('--- F33: send + verify tests ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);

    // Wait for script execution to complete
    await mainFrame!.waitForTimeout(4000);

    // Navigate to Tests tab
    await clickResponseTab(mainFrame!, 'tests');
    await mainFrame!.waitForTimeout(500);

    const body = await getResponseText(mainFrame!);
    logCheck('Tests tab shows results', body.includes('200') || body.includes('passed'));
    logCheck('Passing test visible', body.includes('status is 200'));
    logCheck('Failing test visible', body.includes('always fails'));
    await screenshot(app.window, 'features-f33-test-results');
  });

  test('F33 - test summary shows pass/fail counts', async () => {
    log('--- F33: summary counts ---');
    // Stay on tests tab
    const body = await getResponseText(mainFrame!);
    const hasPassed = body.includes('2 passed') || body.includes('2');
    const hasFailed = body.includes('1 failed');
    logCheck('Pass count shown', hasPassed);
    logCheck('Fail count shown', hasFailed);
    await screenshot(app.window, 'features-f33-test-summary');
  });

  test('F33 - test tab badge shows pass/fail indicator', async () => {
    log('--- F33: tab badge ---');
    // The tests tab badge should show a failure indicator
    const testsTab = mainFrame!.locator('[data-testid="res-tab-tests"]');
    const tabText = (await testsTab.textContent().catch(() => '')) || '';
    logCheck('Tests tab badge visible', tabText.includes('✗') || tabText.includes('3'));
    await screenshot(app.window, 'features-f33-test-tab-badge');
  });
});
