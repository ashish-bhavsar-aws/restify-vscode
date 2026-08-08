import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { describeWsPayload, normalizeWsUrl, WebSocketClient } from '../../src/core/websocket';

describe('normalizeWsUrl', () => {
  it('leaves ws:// URLs unchanged', () => {
    expect(normalizeWsUrl('ws://localhost:3000/ws')).toBe('ws://localhost:3000/ws');
  });

  it('leaves wss:// URLs unchanged', () => {
    expect(normalizeWsUrl('wss://echo.example.com/ws')).toBe('wss://echo.example.com/ws');
  });

  it('defaults localhost to ws://', () => {
    expect(normalizeWsUrl('localhost:3000/ws')).toBe('ws://localhost:3000/ws');
    expect(normalizeWsUrl('127.0.0.1:3000/ws')).toBe('ws://127.0.0.1:3000/ws');
    expect(normalizeWsUrl('localhost/ws')).toBe('ws://localhost/ws');
  });

  it('defaults non-localhost hosts to wss://', () => {
    expect(normalizeWsUrl('echo.example.com/ws')).toBe('wss://echo.example.com/ws');
  });

  it('converts http(s) URLs to their websocket equivalents', () => {
    expect(normalizeWsUrl('http://localhost:3000/ws')).toBe('ws://localhost:3000/ws');
    expect(normalizeWsUrl('https://echo.example.com/ws')).toBe('wss://echo.example.com/ws');
  });

  it('trims whitespace and handles empty input', () => {
    expect(normalizeWsUrl('  ws://localhost:3000/ws  ')).toBe('ws://localhost:3000/ws');
    expect(normalizeWsUrl('')).toBe('');
  });
});

describe('describeWsPayload', () => {
  it('renders text as utf8 with byte length', () => {
    const out = describeWsPayload('text', Buffer.from('ping'));
    expect(out).toEqual({ text: 'ping', byteLength: 4 });
  });

  it('renders binary as hex with byte length', () => {
    const out = describeWsPayload('binary', Buffer.from([0x00, 0x01, 0xff]));
    expect(out).toEqual({ hex: '0001ff', byteLength: 3 });
  });
});

describe('WebSocketClient', () => {
  async function withEchoServer(
    fn: (url: string, server: WebSocketServer) => Promise<void>
  ): Promise<void> {
    const server = new WebSocketServer({ port: 0 });
    server.on('connection', (ws) => {
      ws.on('message', (data, isBinary) => {
        ws.send(data, { binary: isBinary });
      });
    });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const addr = server.address();
      const url = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
      await fn(url, server);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('connects, echoes a text frame, and reports close', async () => {
    await withEchoServer(async (url) => {
      const events: string[] = [];
      const messages: { kind: string; text: string }[] = [];
      const client = new WebSocketClient(url, {
        onOpen: () => events.push('open'),
        onMessage: (kind, data) =>
          messages.push({ kind, text: describeWsPayload(kind, data).text ?? '' }),
        onClose: (code, reason) => events.push(`close:${code}:${reason}`),
        onError: () => events.push('error'),
      });

      const res = await client.connect();
      expect(res.ok).toBe(true);
      expect(events).toEqual(['open']);

      client.sendText('ping');
      await waitFor(() => messages.length === 1);
      expect(messages[0]).toEqual({ kind: 'text', text: 'ping' });

      client.close(1000, 'done');
      await waitFor(() => events.includes('close:1000:done'));
    });
  });

  it('echoes binary frames as binary', async () => {
    await withEchoServer(async (url) => {
      const messages: { kind: string; hex: string }[] = [];
      const client = new WebSocketClient(url, {
        onOpen: () => undefined,
        onMessage: (kind, data) =>
          messages.push({ kind, hex: describeWsPayload(kind, data).hex ?? '' }),
        onClose: () => undefined,
        onError: () => undefined,
      });
      await client.connect();

      client.sendBinary(Buffer.from([0xde, 0xad]));
      await waitFor(() => messages.length === 1);
      expect(messages[0]).toEqual({ kind: 'binary', hex: 'dead' });
      client.close();
    });
  });

  it('fails to connect when the server is unreachable', async () => {
    const client = new WebSocketClient('ws://127.0.0.1:1/nope', {
      onOpen: () => undefined,
      onMessage: () => undefined,
      onClose: () => undefined,
      onError: () => undefined,
    });
    const res = await client.connect();
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('times out when the handshake does not complete', async () => {
    const raw = createServer();
    raw.on('upgrade', () => {
      /* swallow the upgrade — never respond, so the handshake stalls */
    });
    await new Promise<void>((resolve) =>
      raw.listen(0, '127.0.0.1', () => resolve())
    );
    const addr = raw.address() as AddressInfo;
    try {
      const client = new WebSocketClient(`ws://127.0.0.1:${addr.port}`, {
        onOpen: () => undefined,
        onMessage: () => undefined,
        onClose: () => undefined,
        onError: () => undefined,
      }, { timeoutMs: 300 });
      const res = await client.connect();
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Connection timed out');
    } finally {
      raw.close();
    }
  });
});

async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}
