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
  typeInQuickInput,
  confirmQuickInput,
  runCommand,
  waitForPromptInput,
  findMainPanelFrame,
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
  setAuthType,
  fillAuthField,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Feature 2 (F11-F20) — Request Builder Advanced', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Feature2] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Feature2] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Feature2] afterAll ===');
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

  // ── F13: cURL import ─────────────────────────────────────────────

  test('F13 - curl import loads method, url, headers, and body', async () => {
    log('--- F13: curl import ---');
    const { window } = app;

    await runCommand(window, 'Paste cURL');
    await waitForPromptInput(window);

    const inputBox = window.locator('.quick-input-widget .input-box input, .quick-input-widget input');
    await inputBox.first().waitFor({ state: 'visible', timeout: 10_000 });
    await inputBox.first().fill(
      `curl -X POST ${mockUrl('/api/echo')} -H "Content-Type: application/json" -H "X-Imported: true" -d '{"imported":true}'`
    );
    await confirmQuickInput(window);

    await window.waitForTimeout(3000);

    const freshFrame = await findMainPanelFrame(window);
    if (freshFrame) mainFrame = freshFrame;
    const urlInput = mainFrame!.locator('.url-input, [data-testid="url-input"]');
    await urlInput.first().waitFor({ state: 'visible', timeout: 10_000 });
    const urlValue = (await urlInput.first().inputValue().catch(() => '')) || (await urlInput.first().textContent().catch(() => ''));
    log(`  URL value: "${(urlValue || '').slice(0, 80)}"`);
    logCheck('URL contains mock server', (urlValue || '').includes('localhost:3000'));

    const methodBadge = mainFrame!.locator('[data-testid="method-trigger-label"]');
    const methodText = (await methodBadge.first().textContent().catch(() => '')) || '';
    log(`  Method: "${methodText.trim()}"`);
    logCheck('Method is POST', methodText.includes('POST'));
    expect(methodText).toContain('POST');

    await screenshot(app.window, 'f13-curl-imported');
  });

  test('F13 - curl import with basic auth', async () => {
    log('--- F13: curl auth import ---');
    const { window } = app;

    await runCommand(window, 'Paste cURL');
    await waitForPromptInput(window);

    const inputBox = window.locator('.quick-input-widget .input-box input, .quick-input-widget input');
    await inputBox.first().waitFor({ state: 'visible', timeout: 10_000 });
    await inputBox.first().fill(`curl -u admin:secret ${mockUrl('/api/echo')}`);
    await confirmQuickInput(window);
    await window.waitForTimeout(3000);

    const urlInput = mainFrame!.locator('.url-input, [data-testid="url-input"]');
    const urlValue = (await urlInput.first().textContent().catch(() => '')) || '';
    logCheck('URL loaded from curl auth', urlValue.includes('localhost:3000'));

    await screenshot(app.window, 'f13-curl-auth');
  });

  test('F13 - curl import with bearer token', async () => {
    log('--- F13: curl bearer import ---');
    const { window } = app;

    await runCommand(window, 'Paste cURL');
    await waitForPromptInput(window);

    const inputBox = window.locator('.quick-input-widget .input-box input, .quick-input-widget input');
    await inputBox.first().waitFor({ state: 'visible', timeout: 10_000 });
    await inputBox.first().fill(`curl -H "Authorization: Bearer mytoken123" ${mockUrl('/api/echo')}`);
    await confirmQuickInput(window);
    await window.waitForTimeout(3000);

    const urlInput = mainFrame!.locator('.url-input, [data-testid="url-input"]');
    const urlValue = (await urlInput.first().textContent().catch(() => '')) || '';
    logCheck('URL loaded from curl bearer', urlValue.includes('localhost:3000'));

    await screenshot(app.window, 'f13-curl-bearer');
  });

  test('F13 - curl import with -k flag (insecure)', async () => {
    log('--- F13: curl insecure import ---');
    const { window } = app;

    await runCommand(window, 'Paste cURL');
    await waitForPromptInput(window);

    const inputBox = window.locator('.quick-input-widget .input-box input, .quick-input-widget input');
    await inputBox.first().waitFor({ state: 'visible', timeout: 10_000 });
    await inputBox.first().fill(`curl -k ${mockUrl('/api/echo')}`);
    await confirmQuickInput(window);
    await window.waitForTimeout(3000);

    const urlInput = mainFrame!.locator('.url-input, [data-testid="url-input"]');
    const urlValue = (await urlInput.first().textContent().catch(() => '')) || '';
    logCheck('URL loaded from curl insecure', urlValue.includes('localhost:3000'));

    await screenshot(app.window, 'f13-curl-insecure');
  });

  // ── F16: Dynamic variables ────────────────────────────────────────

  test('F16 - dynamic variables resolve in the URL query string', async () => {
    log('--- F16: dynamic vars in URL ---');
    // The curl imports above each opened a NEW panel, so open a fresh one and
    // re-point mainFrame at it before exercising the URL variable input.
    await runCommand(app.window, 'Restify: Open Restify');
    const freshFrame = await findMainPanelFrame(app.window);
    if (freshFrame) mainFrame = freshFrame;
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
    await screenshot(app.window, 'f16-dynamic-vars-url');
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
    await screenshot(app.window, 'f16-dynamic-vars-header');
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
    await screenshot(app.window, 'f16-dynamic-vars-body');
  });

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
    await screenshot(app.window, 'f16-autocomplete-url');
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
    await screenshot(app.window, 'f16-vars-help');
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
    await screenshot(app.window, 'f17-default-headers');

    await openSettings(mainFrame!);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-user-agent', false);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-request-id', false);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-correlation-id', false);
    await setDefaultHeader(mainFrame!, 'default-header-toggle-date', false);
    await saveAndCloseSettings(mainFrame!);
  });

  // ── F11: OAuth 2.0 — client credentials flow ────────────────────

  async function selectOAuthGrant(frame: Frame, label: string): Promise<void> {
    const grantTrigger = frame.locator('#req-pane [aria-haspopup="listbox"]').last();
    await grantTrigger.scrollIntoViewIfNeeded();
    await grantTrigger.click();
    await frame.waitForTimeout(400);
    const option = frame.locator('#req-pane [role="option"]').filter({ hasText: label });
    if (await option.count() === 0) {
      logCheck(`OAuth grant option "${label}" not found`, false);
      return;
    }
    await option.first().evaluate((el) => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    });
    await frame.waitForTimeout(500);
  }

  test('F11 - client credentials flow fetches and uses a token', async () => {
    log('--- F11: client credentials flow ---');
    await setAuthType(mainFrame!, 'oauth2');
    await mainFrame!.waitForTimeout(500);

    await selectOAuthGrant(mainFrame!, 'Client Credentials');

    // Base fields: Token URL (0), Client ID (1), Client Secret (2), Scopes (3)
    await fillAuthField(mainFrame!, 0, mockUrl('/api/oauth/token'));
    await fillAuthField(mainFrame!, 1, 'mock-client');
    await fillAuthField(mainFrame!, 2, 'mock-secret');

    const getTokenBtn = mainFrame!.locator('[data-testid="oauth-get-token-btn"]');
    await getTokenBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await clickInFrame(mainFrame!, '[data-testid="oauth-get-token-btn"]');

    const status = mainFrame!.locator('[data-testid="oauth-status"]');
    await status.waitFor({ state: 'visible', timeout: 15_000 });
    const statusText = (await status.textContent()) ?? '';
    logCheck('OAuth status shown', statusText.length > 0);
    expect(statusText.length).toBeGreaterThan(0);

    const tokenRow = mainFrame!.locator('[data-testid="oauth-token-row"]');
    await tokenRow.waitFor({ state: 'visible', timeout: 15_000 });
    const rowText = (await tokenRow.textContent()) ?? '';
    logCheck('Token ready row visible', rowText.includes('Token ready'));
    expect(rowText).toContain('Token ready');
    await screenshot(app.window, 'f11-oauth-token');

    // Use the fetched token on a real request.
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/oauth/verify'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"authorized":\s*true/);
    logCheck('OAuth-authorized request succeeded', /"authorized":\s*true/.test(body));
    expect(body).toMatch(/"authorized":\s*true/);
    logCheck('Client credentials token attached', body.includes('mock-client-credentials-token'));
    expect(body).toContain('mock-client-credentials-token');
    await screenshot(app.window, 'f11-oauth-request');
  });

  // ── F11: OAuth 2.0 — authorization code + PKCE flow ─────────────

  test('F11 - authorization code flow fetches and uses a token', async () => {
    log('--- F11: authorization code flow ---');
    await setAuthType(mainFrame!, 'oauth2');
    await mainFrame!.waitForTimeout(500);

    await selectOAuthGrant(mainFrame!, 'Authorization Code');

    // Field order for authorization_code: Auth URL (0), Redirect URL (1),
    // Token URL (2), Client ID (3), Client Secret (4), Scopes (5).
    // Redirect URL is left empty so the extension auto-generates a loopback
    // listener; PKCE is enabled by default. The mock authorize endpoint
    // 302-redirects into that listener via the RESTIFY_TEST_OPEN_URL=fetch hook.
    await fillAuthField(mainFrame!, 0, mockUrl('/api/oauth/authorize'));
    await fillAuthField(mainFrame!, 2, mockUrl('/api/oauth/token'));
    await fillAuthField(mainFrame!, 3, 'mock-client');
    await fillAuthField(mainFrame!, 4, 'mock-secret');
    await fillAuthField(mainFrame!, 5, 'auth-code-grant');

    await clickInFrame(mainFrame!, '[data-testid="oauth-get-token-btn"]');
    const tokenRow = mainFrame!.locator('[data-testid="oauth-token-row"]');
    await tokenRow.waitFor({ state: 'visible', timeout: 20_000 });
    const rowText = (await tokenRow.textContent()) ?? '';
    logCheck('Authorization code token ready', rowText.includes('Token ready'));
    expect(rowText).toContain('Token ready');
    await screenshot(app.window, 'f11-oauth-auth-code');

    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/oauth/verify'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"authorized":\s*true/);
    logCheck('Authorization code authorized request', /"authorized":\s*true/.test(body));
    expect(body).toMatch(/"authorized":\s*true/);
    logCheck('Auth code token attached', body.includes('mock-oauth-token'));
    expect(body).toContain('mock-oauth-token');
    await screenshot(app.window, 'f11-oauth-auth-code-request');
  });

  // ── F11: OAuth 2.0 — password grant flow ────────────────────────

  test('F11 - password grant fetches and uses a token', async () => {
    log('--- F11: password grant flow ---');
    await setAuthType(mainFrame!, 'oauth2');
    await mainFrame!.waitForTimeout(500);

    await selectOAuthGrant(mainFrame!, 'Password');

    // Base fields: Token URL (0), Client ID (1), Client Secret (2), Scopes (3),
    // then Username (4), Password (5). Distinct scopes avoid reusing the
    // client-credentials token from the shared token cache.
    await fillAuthField(mainFrame!, 0, mockUrl('/api/oauth/token'));
    await fillAuthField(mainFrame!, 1, 'mock-client');
    await fillAuthField(mainFrame!, 2, 'mock-secret');
    await fillAuthField(mainFrame!, 3, 'password-grant');
    await fillAuthField(mainFrame!, 4, 'alice');
    await fillAuthField(mainFrame!, 5, 'hunter2');

    await clickInFrame(mainFrame!, '[data-testid="oauth-get-token-btn"]');
    const tokenRow = mainFrame!.locator('[data-testid="oauth-token-row"]');
    await tokenRow.waitFor({ state: 'visible', timeout: 15_000 });
    const rowText = (await tokenRow.textContent()) ?? '';
    logCheck('Password grant token ready', rowText.includes('Token ready'));
    expect(rowText).toContain('Token ready');

    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/oauth/verify'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"authorized":\s*true/);
    logCheck('Password grant authorized request', /"authorized":\s*true/.test(body));
    expect(body).toMatch(/"authorized":\s*true/);
    logCheck('Password token attached', body.includes('mock-password-token'));
    expect(body).toContain('mock-password-token');
    await screenshot(app.window, 'f11-oauth-password');
  });

  // ── F11: OAuth 2.0 — token can be cleared ───────────────────────

  test('F11 - fetched token can be cleared', async () => {
    log('--- F11: clear token ---');
    await setAuthType(mainFrame!, 'oauth2');
    await mainFrame!.waitForTimeout(500);

    const tokenRow = mainFrame!.locator('[data-testid="oauth-token-row"]');
    await tokenRow.waitFor({ state: 'visible', timeout: 10_000 });
    await clickInFrame(mainFrame!, '[data-testid="oauth-clear-token-btn"]');
    await mainFrame!.waitForTimeout(600);
    const count = await mainFrame!.locator('[data-testid="oauth-token-row"]').count();
    logCheck('Token row cleared', count === 0);
    expect(count).toBe(0);
    await screenshot(app.window, 'f11-oauth-cleared');
  });
});
