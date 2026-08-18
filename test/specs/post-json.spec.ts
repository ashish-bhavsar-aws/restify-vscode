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
  setBodyType,
  fillBody,
  clickRequestTab,
} from '../utils/helpers';

test.describe('POST JSON Requests', () => {
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

  test('should send POST with JSON body', async () => {
    log('--- Test: POST JSON body ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'json');
    await fillBody(frame, JSON.stringify({ name: 'Test User', email: 'test@example.com' }, null, 2));
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    const body = await getResponseText(frame);
    expect(body).toContain('Test User');
    expect(body).toContain('test@example.com');

    await screenshot(app.window, 'post-json-body');
  });

  test('should send POST to form-data endpoint', async () => {
    log('--- Test: POST form-data endpoint ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'form');
    await setUrl(frame, mockUrl('/api/form-data'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'post-form-data');
  });

  test('should send POST with JSON to json-field endpoint', async () => {
    log('--- Test: POST JSON to json-field ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'json');
    await fillBody(frame, JSON.stringify({ message: 'Hello API' }, null, 2));
    await setUrl(frame, mockUrl('/api/json-field'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'post-json-field');
  });

  test('should send POST with text body', async () => {
    log('--- Test: POST text body ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'text');
    await fillBody(frame, 'Plain text payload for testing');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'post-text-body');
  });

  test('should display POST response body in pretty format', async () => {
    log('--- Test: POST response pretty body ---');
    await clickRequestTab(frame, 'body');
    await frame.waitForTimeout(300);

    await screenshot(app.window, 'post-pretty-body');
  });

  test('should send POST with XML body', async () => {
    log('--- Test: POST XML body ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'xml');
    await fillBody(frame, '<?xml version="1.0"?>\n<root><name>Test</name></root>');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'post-xml-body');
  });
});
