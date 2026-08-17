import * as http from "http";

export interface MockRoute {
  method: string;
  path: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface MockMatch {
  route: MockRoute;
  params: Record<string, string>;
}

export function matchRoute(
  routes: MockRoute[],
  method: string,
  urlPath: string
): MockMatch | null {
  const normalizedMethod = method.toUpperCase();
  for (const route of routes) {
    if (route.method !== normalizedMethod) continue;
    const params = matchPath(route.path, urlPath);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}

export function matchPath(
  pattern: string,
  actual: string
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const actualParts = actual.split("/").filter(Boolean);
  if (patternParts.length !== actualParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    const ap = actualParts[i];
    if (pp.startsWith("{") && pp.endsWith("}")) {
      params[pp.slice(1, -1)] = decodeURIComponent(ap);
    } else if (pp !== ap) {
      return null;
    }
  }
  return params;
}

export function createMockHandler(
  routes: MockRoute[]
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = req.url || "/";
    const urlObj = new URL(url, "http://localhost");
    const method = (req.method || "GET").toUpperCase();
    const match = matchRoute(routes, method, urlObj.pathname);
    if (!match) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No matching mock route", method, path: urlObj.pathname }));
      return;
    }
    const { route } = match;
    const headers = { ...route.headers, "X-Mock-Server": "restify" };
    res.writeHead(route.statusCode, headers);
    res.end(route.body);
  };
}

export function startMockServer(
  routes: MockRoute[],
  port: number = 0
): Promise<{ server: http.Server; port: number; url: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(createMockHandler(routes));
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({ server, port: actualPort, url: `http://127.0.0.1:${actualPort}` });
    });
    server.on("error", reject);
  });
}

export function stopMockServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) { resolve(); return; }
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
