import * as vscode from "vscode";
import { StorageManager } from "../storage/StorageManager";
import { startMockServer, stopMockServer, type MockRoute } from "../core/mockServer";
import type { Server } from "http";

export class MockServerManager {
  private _server: Server | null = null;
  private _port: number = 0;
  private _url: string = "";
  private _statusBarItem: vscode.StatusBarItem;
  private _outputChannel: vscode.OutputChannel;

  constructor(private context: vscode.ExtensionContext, private storageManager: StorageManager) {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    this._statusBarItem.command = "restify.stopMockServer";
    this._statusBarItem.tooltip = "Click to stop mock server";
    this._outputChannel = vscode.window.createOutputChannel("Restify: Mock Server");
  }

  get isRunning(): boolean { return this._server !== null; }
  get url(): string { return this._url; }

  async start(collectionId?: string): Promise<void> {
    if (this._server) {
      vscode.window.showWarningMessage("Mock server is already running. Stop it first.");
      return;
    }
    const collections = this.storageManager.getCollections();
    let collection;
    if (collectionId) {
      collection = collections.find(c => c.id === collectionId);
    } else if (collections.length === 1) {
      collection = collections[0];
    } else if (collections.length > 1) {
      const picks = collections.map(c => ({
        label: c.name,
        description: `${(c.requests || []).length} request(s)`,
        id: c.id,
      }));
      const chosen = await vscode.window.showQuickPick(picks, {
        placeHolder: "Select a collection to mock",
      });
      if (!chosen) return;
      collection = collections.find(c => c.id === chosen.id);
    }
    if (!collection) {
      vscode.window.showWarningMessage("No collections found. Create a collection first.");
      return;
    }

    const routes = this._buildRoutes(collection);
    if (routes.length === 0) {
      vscode.window.showWarningMessage(`Collection "${collection.name}" has no requests to mock.`);
      return;
    }

    try {
      const { server, port, url } = await startMockServer(routes, 0);
      this._server = server;
      this._port = port;
      this._url = url;

      this._statusBarItem.text = `$(circle-slash) Mock: ${port}`;
      this._statusBarItem.tooltip = `Mock server running on port ${port}. Click to stop.`;
      this._statusBarItem.show();

      this._outputChannel.clear();
      this._outputChannel.appendLine(`Mock server started on ${url}`);
      this._outputChannel.appendLine(`Collection: ${collection.name}`);
      this._outputChannel.appendLine(`Routes (${routes.length}):`);
      for (const r of routes) {
        this._outputChannel.appendLine(`  ${r.method.padEnd(7)} ${r.path.padEnd(30)} → ${r.statusCode}`);
      }
      this._outputChannel.appendLine("");
      this._outputChannel.appendLine("Waiting for requests...");

      vscode.window.showInformationMessage(
        `Mock server running at ${url} (${routes.length} routes from "${collection.name}")`
      );
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to start mock server: ${e?.message || e}`);
    }
  }

  async stop(): Promise<void> {
    if (!this._server) {
      vscode.window.showInformationMessage("No mock server is running.");
      return;
    }
    await stopMockServer(this._server);
    this._server = null;
    this._port = 0;
    this._url = "";
    this._statusBarItem.hide();
    this._outputChannel.appendLine("Mock server stopped.");
    vscode.window.showInformationMessage("Mock server stopped.");
  }

  dispose(): void {
    if (this._server) {
      this._server.close();
      this._server = null;
    }
    this._statusBarItem.dispose();
    this._outputChannel.dispose();
  }

  private _buildRoutes(collection: any): MockRoute[] {
    const routes: MockRoute[] = [];
    const visitRequests = (requests: any[]) => {
      for (const req of requests || []) {
        const route = this._requestToRoute(req);
        if (route) routes.push(route);
      }
    };
    visitRequests(collection.requests || []);
    const visitGroups = (groups: any[] | undefined) => {
      for (const g of groups || []) {
        visitRequests(g.requests || []);
        visitGroups(g.groups);
      }
    };
    visitGroups(collection.groups);
    return routes;
  }

  private _requestToRoute(req: any): MockRoute | null {
    const method = (req.method || "GET").toUpperCase();
    let path = "/";
    try {
      const url = new URL(req.url || "http://localhost/");
      path = url.pathname || "/";
    } catch {
      const match = (req.url || "").match(/^(?:[a-z][a-z0-9+.-]*:\/\/[^/]+)?(\/.*)?$/i);
      path = match?.[1] || "/";
    }
    path = path.replace(/:([A-Za-z0-9_-]+)/g, "{$1}");

    const headers: Record<string, string> = {};
    if (req.bodyType === "json") headers["Content-Type"] = "application/json";
    else if (req.bodyType === "xml") headers["Content-Type"] = "application/xml";
    else if (req.bodyType === "text") headers["Content-Type"] = "text/plain";

    const body = req.mockBody ?? req.body ?? "";

    return {
      method,
      path,
      statusCode: 200,
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    };
  }
}
