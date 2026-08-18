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
  setMethod,
  setBodyType,
  fillBody,
  clickRequestTab,
} from '../utils/helpers';

test.describe('Request Body Types', () => {
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

  test('should send JSON body', async () => {
    log('--- Test: JSON body type ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'json');
    await fillBody(frame, JSON.stringify({ key: 'value', nested: { a: 1 } }, null, 2));
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'body-json');
  });

  test('should send XML body', async () => {
    log('--- Test: XML body type ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'xml');
    await fillBody(frame, '<?xml version="1.0"?>\n<user><name>John</name><age>30</age></user>');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'body-xml');
  });

  test('should send text body', async () => {
    log('--- Test: Text body type ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'text');
    await fillBody(frame, 'Hello, this is plain text content.');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'body-text');
  });

  test('should send form-urlencoded body', async () => {
    log('--- Test: URL-encoded body type ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'urlencoded');
    await fillBody(frame, 'username=testuser&password=testpass&remember=true');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'body-urlencoded');
  });

  test('should send form-data body', async () => {
    log('--- Test: Form-data body type ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'form');
    await setUrl(frame, mockUrl('/api/form-data'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'body-form-data');
  });

  test('should switch between body types', async () => {
    log('--- Test: Switch body types ---');
    await clickRequestTab(frame, 'body');
    await frame.waitForTimeout(300);

    await setBodyType(frame, 'json');
    await frame.waitForTimeout(200);
    await screenshot(app.window, 'body-switch-json');

    await setBodyType(frame, 'xml');
    await frame.waitForTimeout(200);
    await screenshot(app.window, 'body-switch-xml');

    await setBodyType(frame, 'text');
    await frame.waitForTimeout(200);
    await screenshot(app.window, 'body-switch-text');
  });

  test('should send GraphQL body', async () => {
    log('--- Test: GraphQL body type ---');
    await setMethod(frame, 'POST');
    await setBodyType(frame, 'graphql');
    await fillBody(frame, '{ users { id name email } }');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'body-graphql');
  });
});
