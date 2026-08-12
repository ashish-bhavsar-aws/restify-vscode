import * as vscode from 'vscode';
import { StorageManager } from '../../storage/StorageManager';
import { parseIterationData, runCollectionRequests } from '../../core/collectionRunner';
import { showOpenDialog } from '../dialogStub';
import { flattenCollectionRequests } from './sidebarHelpers';

export class CollectionRunner {
  private _runController?: AbortController;
  private _send: (msg: any) => void;

  constructor(private storage: StorageManager, postMessage: (msg: any) => void) {
    this._send = postMessage;
  }

  async runCollection(collectionId: string, groupId: string | null): Promise<void> {
    await this._run(collectionId, groupId);
  }

  get isRunning(): boolean {
    return !!this._runController;
  }

  cancel(): void {
    this._runController?.abort();
  }

  private async _pickIterationData(): Promise<Record<string, string>[] | null> {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: '$(circle-slash) Run without data',
          description: 'Execute each request once',
          id: 'none',
        },
        {
          label: '$(file-text) Run with data file...',
          description: 'Iterate over CSV / JSON rows (each row injects variables)',
          id: 'data',
        },
      ],
      { placeHolder: 'Data-driven run' }
    );
    if (!choice) return null;
    if (choice.id === 'none') return [];

    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'CSV / JSON': ['csv', 'json'] },
      openLabel: 'Select Data File',
    });
    if (!uris || !uris[0]) return null;
    const raw = Buffer.from(
      await vscode.workspace.fs.readFile(uris[0])
    ).toString('utf8');
    const rows = parseIterationData(raw, uris[0].fsPath);
    if (rows.length === 0) {
      vscode.window.showWarningMessage('No data rows found in the selected file.');
      return null;
    }
    return rows;
  }

  private async _run(collectionId: string, groupId: string | null): Promise<void> {
    const col = this.storage
      .getCollections()
      .find((c) => String(c.id) === String(collectionId));
    if (!col) return;
    if (this._runController) {
      vscode.window.showWarningMessage('A collection run is already in progress');
      return;
    }

    const requests = flattenCollectionRequests(col, groupId);
    if (requests.length === 0) {
      vscode.window.showWarningMessage('This collection has no requests to run');
      return;
    }

    const iterationData = await this._pickIterationData();
    if (iterationData === null) return;

    const controller = new AbortController();
    this._runController = controller;
    this._send({
      command: 'collectionRunStarted',
      collectionId,
      groupId,
      total: requests.length * Math.max(1, iterationData.length),
    });

    let cookies = this.storage.getCookies();
    try {
      const colVars = this.storage
        .getCollectionVariables(collectionId)
        .reduce(
          (m, v) => {
            if (v.key) m[v.key] = v.value;
            return m;
          },
          {} as Record<string, string>,
        );
      const results = await runCollectionRequests({
        requests,
        variables: {
          ...colVars,
          ...this.storage.getActiveEnvironmentVariables(),
        },
        signal: controller.signal,
        cookies,
        iterationData,
        preScript: col.preScript,
        testScript: col.testScript,
        onCookiesChanged: (next) => {
          cookies = next;
          this.storage.saveCookies(next);
        },
        onProgress: (entry, index, total) => {
          this._send({
            command: 'collectionRunProgress',
            entry,
            index,
            total,
          });
        },
      });
      this._send({
        command: 'collectionRunComplete',
        results,
        collectionId,
        groupId,
        cancelled: controller.signal.aborted,
      });
    } catch (err: any) {
      this._send({
        command: 'collectionRunComplete',
        results: [],
        collectionId,
        groupId,
        error: err?.message ?? String(err),
      });
    } finally {
      this._runController = undefined;
    }
  }
}
