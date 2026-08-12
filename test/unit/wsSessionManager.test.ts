import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { WsSessionManager } from "../../src/panels/WsSessionManager";

interface Posted {
  command: string;
  tabId?: string;
  state?: string;
  protocol?: string;
  code?: number;
  reason?: string;
  error?: string;
  entry?: { direction?: string; kind?: string; text?: string; hex?: string };
}

async function withEchoServer(
  fn: (url: string, server: WebSocketServer) => Promise<void>,
): Promise<void> {
  const server = new WebSocketServer({ port: 0 });
  const handshakes: IncomingMessage[] = [];
  server.on("connection", (ws, req) => {
    handshakes.push(req);
    ws.on("message", (data, isBinary) => {
      ws.send(data, { binary: isBinary });
    });
  });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const addr = server.address();
    const url = `ws://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    await fn(url, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function makeManager() {
  const posted: Posted[] = [];
  const manager = new WsSessionManager(
    (msg) => posted.push(msg),
    (raw) => raw.replace("{{TOKEN}}", "abc123").replace("{{HOST}}", "127.0.0.1"),
  );
  return { manager, posted };
}

async function waitFor(
  cond: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("WsSessionManager", () => {
  it("connects a tab and posts status/log messages scoped by tabId", async () => {
    await withEchoServer(async (url) => {
      const { manager, posted } = makeManager();
      manager.handleMessage({
        command: "wsConnect",
        tabId: "t1",
        url,
        token: "",
      });

      await waitFor(() =>
        posted.some((m) => m.command === "wsStatus" && m.state === "connected"),
      );

      const tabIds = posted.map((m) => m.tabId);
      expect(tabIds.every((id) => id === "t1")).toBe(true);
      expect(posted.some((m) => m.command === "wsClear" && m.tabId === "t1")).toBe(true);
      expect(
        posted.some(
          (m) => m.command === "wsStatus" && m.state === "connecting",
        ),
      ).toBe(true);
      expect(
        posted.some(
          (m) =>
            m.command === "wsLog" &&
            m.entry?.direction === "system" &&
            (m.entry?.text ?? "").includes("Connecting to"),
        ),
      ).toBe(true);

      manager.disconnectTab("t1");
    });
  });

  it("round-trips a text message as out + in log entries", async () => {
    await withEchoServer(async (url) => {
      const { manager, posted } = makeManager();
      manager.handleMessage({ command: "wsConnect", tabId: "t1", url, token: "" });
      await waitFor(() =>
        posted.some((m) => m.command === "wsStatus" && m.state === "connected"),
      );

      manager.handleMessage({
        command: "wsSend",
        tabId: "t1",
        data: "ping from restify",
        binary: false,
      });

      await waitFor(() =>
        posted.some(
          (m) =>
            m.command === "wsLog" &&
            m.entry?.direction === "in" &&
            m.entry?.text === "ping from restify",
        ),
      );
      expect(
        posted.some(
          (m) =>
            m.command === "wsLog" &&
            m.entry?.direction === "out" &&
            m.entry?.text === "ping from restify",
        ),
      ).toBe(true);

      manager.disconnectTab("t1");
    });
  });

  it("sends a Bearer token from the auth data on the handshake", async () => {
    const server = new WebSocketServer({ port: 0 });
    const authorizations: string[] = [];
    server.on("connection", (ws, req) => {
      authorizations.push(req.headers.authorization ?? "");
      ws.on("message", (data, isBinary) => ws.send(data, { binary: isBinary }));
    });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      const { manager, posted } = makeManager();
      manager.handleMessage({
        command: "wsConnect",
        tabId: "t1",
        url: `ws://127.0.0.1:${port}/secure`,
        token: "{{TOKEN}}",
      });

      await waitFor(() =>
        posted.some((m) => m.command === "wsStatus" && m.state === "connected"),
      );
      expect(authorizations).toEqual(["Bearer abc123"]);

      manager.disconnectTab("t1");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("disconnect posts a closed status and drops the session", async () => {
    await withEchoServer(async (url) => {
      const { manager, posted } = makeManager();
      manager.handleMessage({ command: "wsConnect", tabId: "t1", url, token: "" });
      await waitFor(() =>
        posted.some((m) => m.command === "wsStatus" && m.state === "connected"),
      );

      manager.handleMessage({ command: "wsDisconnect", tabId: "t1" });
      await waitFor(() =>
        posted.some((m) => m.command === "wsStatus" && m.state === "closed"),
      );

      // A send on the dropped session is a no-op.
      const before = posted.length;
      manager.handleMessage({ command: "wsSend", tabId: "t1", data: "x", binary: false });
      expect(posted.length).toBe(before);
    });
  });

  it("closeAll disconnects every open session", async () => {
    await withEchoServer(async (url) => {
      const { manager, posted } = makeManager();
      manager.handleMessage({ command: "wsConnect", tabId: "t1", url, token: "" });
      manager.handleMessage({ command: "wsConnect", tabId: "t2", url, token: "" });
      await waitFor(
        () =>
          posted.filter((m) => m.command === "wsStatus" && m.state === "connected")
            .length === 2,
      );

      manager.closeAll();
      await waitFor(
        () =>
          posted.filter((m) => m.command === "wsStatus" && m.state === "closed")
            .length === 2,
      );
      expect(
        posted
          .filter((m) => m.command === "wsStatus" && m.state === "closed")
          .map((m) => m.tabId)
          .sort(),
      ).toEqual(["t1", "t2"]);
    });
  });
});
