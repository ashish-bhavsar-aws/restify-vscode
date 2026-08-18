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
  getResponseText,
  setMethod,
  fillBearerToken,
  fillBasicAuth,
  fillApiKeyAuth,
  fillDigestAuth,
  fillJwtAuth,
  fillHawkAuth,
  clickRequestTab,
  setBodyType,
  fillBody,
} from '../utils/helpers';

test.describe('Authentication', () => {
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

  test('should send request with Bearer token auth', async () => {
    log('--- Test: Bearer token auth ---');
    await fillBearerToken(frame, 'my-secret-bearer-token');
    await setUrl(frame, mockUrl('/api/auth/verify'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    const body = await getResponseText(frame);
    expect(body).toContain('my-secret-bearer-token');

    await screenshot(app.window, 'auth-bearer-token');
  });

  test('should send request with Basic auth', async () => {
    log('--- Test: Basic auth ---');
    await fillBasicAuth(frame, 'admin', 'password123');
    await setUrl(frame, mockUrl('/api/auth/verify'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'auth-basic');
  });

  test('should send request with API Key auth (header)', async () => {
    log('--- Test: API Key auth ---');
    await fillApiKeyAuth(frame, 'X-API-Key', 'my-api-key-12345', 'header');
    await setUrl(frame, mockUrl('/api/auth/verify'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    const body = await getResponseText(frame);
    expect(body).toContain('my-api-key-12345');

    await screenshot(app.window, 'auth-api-key');
  });

  test('should send request with Digest auth', async () => {
    log('--- Test: Digest auth ---');
    await fillDigestAuth(frame, 'digestuser', 'digestpass');
    await setUrl(frame, mockUrl('/api/auth/digest'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'auth-digest');
  });

  test('should send request with JWT auth', async () => {
    log('--- Test: JWT auth ---');
    await fillJwtAuth(frame, { secret: 'test-secret', issuer: 'restify', expiresIn: '3600' });
    await setUrl(frame, mockUrl('/api/auth/jwt'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    const body = await getResponseText(frame);
    expect(body).toContain('restify');

    await screenshot(app.window, 'auth-jwt');
  });

  test('should send request with Hawk auth', async () => {
    log('--- Test: Hawk auth ---');
    await fillHawkAuth(frame, 'hawk-id', 'hawk-secret');
    await setUrl(frame, mockUrl('/api/auth/hawk'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'auth-hawk');
  });

  test('should display auth tab correctly', async () => {
    log('--- Test: Auth tab display ---');
    await clickRequestTab(frame, 'auth');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'auth-tab-display');
  });

  test('should send POST with Bearer auth', async () => {
    log('--- Test: POST with Bearer auth ---');
    await setMethod(frame, 'POST');
    await fillBearerToken(frame, 'post-bearer-token');
    await setBodyType(frame, 'json');
    await fillBody(frame, JSON.stringify({ test: true }, null, 2));
    await setUrl(frame, mockUrl('/api/auth/verify'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'auth-post-bearer');
  });
});
