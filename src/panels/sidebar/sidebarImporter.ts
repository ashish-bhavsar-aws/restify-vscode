import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { StorageManager } from '../../storage/StorageManager';
import {
  parseImportText,
  collectionToPostman,
  collectionToOpenApi,
  collectionToHar,
  collectionToHttpText,
  parseYaml,
  parsePostmanCollection,
  parseOpenApiCollection,
  type ImportSource,
  type ImportedCollection,
} from '../../core/converters';
import { showOpenDialog, showSaveDialog } from '../dialogStub';
import { countImportedRequests, httpGet, normalizeImportedCollection } from './sidebarHelpers';

export class CollectionImporter {
  constructor(private storage: StorageManager) {}

  async exportCollection(col: any): Promise<void> {
    const format = await this._chooseExportFormat();
    if (!format) return;
    await this._writeExportFile(col, format);
  }

  private async _chooseExportFormat(): Promise<string | undefined> {
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(file-json) Restify JSON', description: 'Native Restify collection format', id: 'restify' },
        { label: '$(file-code) Postman Collection', description: 'Postman v2.1 collection JSON', id: 'postman' },
        { label: '$(file-code) OpenAPI 3.0', description: 'OpenAPI / Swagger 3.0 document (YAML-style JSON)', id: 'openapi' },
        { label: '$(file-binary) HAR', description: 'HAR 1.2 HTTP archive JSON', id: 'har' },
        { label: '$(file-text) REST Client .http', description: 'REST Client `.http` document', id: 'http' },
      ],
      { placeHolder: 'Select export format' }
    ) as { id: string } | undefined;
    return choice?.id;
  }

  private async _writeExportFile(col: any, format: string): Promise<void> {
    const safe = (col.name || 'collection').replace(/[^a-z0-9._-]/gi, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
    const extensions: Record<string, string[]> = {
      restify: ['json'],
      postman: ['json'],
      openapi: ['json'],
      har: ['har'],
      http: ['http'],
    };
    const defaultExt = (extensions[format] || ['json'])[0];
    const data = (() => {
      switch (format) {
        case 'postman':
          return JSON.stringify(collectionToPostman(col as ImportedCollection), null, 2);
        case 'openapi':
          return JSON.stringify(collectionToOpenApi(col as ImportedCollection), null, 2);
        case 'har':
          return JSON.stringify(collectionToHar(col as ImportedCollection), null, 2);
        case 'http':
          return collectionToHttpText(col as ImportedCollection);
        default:
          return JSON.stringify(col, null, 2);
      }
    })();

    const uri = await showSaveDialog({
      defaultUri: vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file(os.homedir()),
        `${safe || 'collection'}.${defaultExt}`
      ),
      filters: { [format.toUpperCase()]: extensions[format] },
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
    vscode.window.showInformationMessage(`\u2713 Collection exported to ${uri.fsPath}`);
  }

  async exportAll(): Promise<void> {
    const cols = this.storage.getCollections();
    if (!cols.length) {
      vscode.window.showWarningMessage('No collections to export');
      return;
    }
    const data = JSON.stringify(cols, null, 2);
    const defaultName = 'restify.collections.json';
    const fileName = await vscode.window.showInputBox({
      prompt: 'Enter a filename for the exported collections',
      value: defaultName,
      validateInput: (v) => v.trim() ? null : 'Filename cannot be empty',
    });
    if (!fileName) return;
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const targetUri = wsFolder
      ? vscode.Uri.joinPath(wsFolder, fileName)
      : vscode.Uri.file(path.join(os.homedir(), fileName));
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(data, 'utf8'));
    vscode.window.showInformationMessage(`✓ Exported ${cols.length} collection${cols.length !== 1 ? 's' : ''}`);
  }
  async importCollection(): Promise<void> {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: '$(file-code) Postman Collection',
          description: 'Import requests from a Postman Collection JSON file',
          id: 'postman',
        },
        {
          label: '$(file-code) OpenAPI / Swagger File',
          description: 'Import endpoints from a Swagger / OpenAPI JSON file',
          id: 'swagger-file',
        },
        {
          label: '$(globe) WSDL / SOAP Service',
          description: 'Import SOAP operations from a WSDL document',
          id: 'wsdl',
        },
        {
          label: '$(cloud-download) WSDL / SOAP Service URL',
          description: 'Fetch and import SOAP operations from a WSDL URL',
          id: 'wsdl-url',
        },
        {
          label: '$(cloud-download) OpenAPI / Swagger URL',
          description: 'Fetch and import endpoints from a Swagger / OpenAPI URL',
          id: 'swagger-url',
        },
        {
          label: '$(file-zip) Restify Collection',
          description: 'Import a previously exported Restify collection JSON file',
          id: 'restify',
        },
        {
          label: '$(file-binary) HAR File',
          description: 'Import requests captured in a HAR (HTTP Archive) JSON file',
          id: 'har',
        },
        {
          label: '$(bug) Insomnia Export',
          description: 'Import requests from an Insomnia JSON export',
          id: 'insomnia',
        },
        {
          label: '$(file-text) REST Client .http File',
          description: 'Import requests from a REST Client `.http` document',
          id: 'http',
        },
      ],
      { placeHolder: 'Select import source' }
    ) as { label: string; description: string; id: string } | undefined;

    if (!choice) return;

    switch (choice.id) {
      case 'restify':
        await this._importRestifyCollection();
        break;
      case 'postman':
        await this._importPostmanCollection();
        break;
      case 'wsdl':
        await this._importWsdlFile();
        break;
      case 'wsdl-url':
        await this._importWsdlUrl();
        break;
      case 'swagger-file':
        await this._importSwaggerFile();
        break;
      case 'swagger-url':
        await this._importSwaggerUrl();
        break;
      case 'har':
      case 'insomnia':
      case 'http':
        await this._importConvertedFile(choice.id);
        break;
    }
  }

  private async _importConvertedFile(source: Exclude<ImportSource, null>): Promise<void> {
    const labels: Record<string, { filter: { [k: string]: string[] }; title: string }> = {
      har: { filter: { 'HAR (HTTP Archive)': ['har', 'json'] }, title: 'Import HAR File' },
      insomnia: { filter: { 'Insomnia Export': ['json'] }, title: 'Import Insomnia Export' },
      http: { filter: { 'REST Client (.http)': ['http'] }, title: 'Import .http File' },
    };
    const cfg = labels[source];
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: cfg.filter,
      openLabel: cfg.title,
    });
    if (!uris || !uris[0]) return;

    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    const collection = parseImportText(raw, source);
    if (!collection) {
      vscode.window.showErrorMessage(
        `Import failed: file does not look like a valid ${source} document`
      );
      return;
    }
    await this._saveImportedCollection(collection);
    const total = countImportedRequests(collection);
    vscode.window.showInformationMessage(
      `\u2713 Imported "${collection.name}" with ${total} request(s)`
    );
  }

  private async _saveImportedCollection(collection: ImportedCollection): Promise<void> {
    const existing = this.storage
      .getCollections()
      .find((c) => c.name === collection.name);
    this.storage.saveCollection({
      ...normalizeImportedCollection(collection),
      id: existing?.id || collection.id,
    });
  }

  private async _importRestifyCollection(): Promise<void> {
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'Restify Collection JSON': ['json'] },
      openLabel: 'Import Restify Collection',
    });
    if (!uris || !uris[0]) return;
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    try {
      const imported = JSON.parse(raw);
      const cols: any[] = Array.isArray(imported) ? imported : [imported];
      let count = 0;
      for (const col of cols) {
        if (col.name) {
          const existing = this.storage.getCollections().find((c) => c.name === col.name);
          const toSave = { ...col, id: existing?.id || col.id || Date.now().toString() };
          this.storage.saveCollection(toSave);
          count++;
        }
      }
      vscode.window.showInformationMessage(`\u2713 Imported ${count} collection${count !== 1 ? 's' : ''}`);
    } catch {
      vscode.window.showErrorMessage('Import failed: invalid Restify collection file');
    }
  }

  private async _importPostmanCollection(): Promise<void> {
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'Postman Collection JSON': ['json'] },
      openLabel: 'Import Postman Collection',
    });
    if (!uris || !uris[0]) return;
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    try {
      const data = JSON.parse(raw);
      const collection = parsePostmanCollection(data);
      if (!collection) {
        vscode.window.showErrorMessage('Import failed: file does not look like a Postman Collection');
        return;
      }
      const existing = this.storage.getCollections().find((c) => c.name === collection.name);
      this.storage.saveCollection({
        ...collection,
        id: existing?.id || collection.id,
      });
      vscode.window.showInformationMessage(
        `\u2713 Imported "${collection.name}" with ${countImportedRequests(collection)} request(s)`
      );
    } catch {
      vscode.window.showErrorMessage('Import failed: invalid or unsupported Postman Collection file');
    }
  }

  private async _importWsdlFile(): Promise<void> {
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'WSDL / SOAP Service': ['wsdl', 'xml'] },
      openLabel: 'Import WSDL / SOAP Service',
    });
    if (!uris || !uris[0]) return;

    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    const collection = parseImportText(raw, 'wsdl');
    if (!collection) {
      vscode.window.showErrorMessage('Import failed: file does not look like a valid WSDL document');
      return;
    }
    await this._saveImportedCollection(collection);
    const total = countImportedRequests(collection);
    vscode.window.showInformationMessage(
      `\u2713 Imported "${collection.name}" with ${total} request(s)`,
    );
  }

  private async _importWsdlUrl(): Promise<void> {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter the WSDL / SOAP Service URL',
      placeHolder: 'https://example.com/service?wsdl',
      validateInput: (v) => {
        try {
          const u = new URL(v);
          if (u.protocol !== 'https:' && u.protocol !== 'http:') {
            return 'URL must use http or https';
          }
          return undefined;
        } catch {
          return 'Enter a valid URL';
        }
      },
    });
    if (!url) return;

    try {
      const { statusCode, body } = await httpGet(url);
      if (statusCode < 200 || statusCode >= 300) {
        vscode.window.showErrorMessage(`Import failed: server responded with ${statusCode}`);
        return;
      }
      const collection = parseImportText(body, 'wsdl');
      if (!collection) {
        vscode.window.showErrorMessage('Import failed: URL did not return a valid WSDL document');
        return;
      }
      await this._saveImportedCollection(collection);
      const total = countImportedRequests(collection);
      vscode.window.showInformationMessage(
        `\u2713 Imported "${collection.name}" with ${total} request(s)`,
      );
    } catch {
      vscode.window.showErrorMessage('Import failed: could not fetch the WSDL from the URL');
    }
  }

  private async _importSwaggerFile(): Promise<void> {
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'OpenAPI / Swagger (JSON or YAML)': ['json', 'yaml', 'yml'] },
      openLabel: 'Import Swagger / OpenAPI File',
    });
    if (!uris || !uris[0]) return;
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    try {
      const isYaml = /\.(yaml|yml)$/i.test(uris[0].fsPath);
      let data: any;
      if (isYaml) {
        data = parseYaml(raw);
      } else {
        data = JSON.parse(raw);
      }
      const collection = parseOpenApiCollection(data);
      if (!collection) {
        vscode.window.showErrorMessage('Import failed: file does not look like an OpenAPI / Swagger document');
        return;
      }
      const existing = this.storage.getCollections().find((c) => c.name === collection.name);
      this.storage.saveCollection({
        ...collection,
        id: existing?.id || collection.id,
      });
      const total = collection.requests.length + (collection.groups || []).reduce((s: number, g: any) => s + (g.requests?.length || 0), 0);
      const groupCount = (collection.groups || []).length;
      vscode.window.showInformationMessage(
        `\u2713 Imported "${collection.name}" with ${total} endpoint(s)${groupCount ? ` in ${groupCount} group(s)` : ''}`
      );
    } catch {
      vscode.window.showErrorMessage('Import failed: invalid or unsupported OpenAPI / Swagger file');
    }
  }

  private async _importSwaggerUrl(): Promise<void> {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter the OpenAPI / Swagger URL (must return JSON)',
      placeHolder: 'https://petstore.swagger.io/v2/swagger.json',
      validateInput: (v) => {
        try {
          const u = new URL(v);
          if (u.protocol !== 'https:' && u.protocol !== 'http:') {
            return 'URL must use http or https';
          }
          return undefined;
        } catch {
          return 'Enter a valid URL';
        }
      },
    });
    if (!url) return;

    try {
      const { statusCode, body, contentType } = await httpGet(url);
      if (statusCode < 200 || statusCode >= 300) {
        vscode.window.showErrorMessage(`Import failed: server responded with ${statusCode}`);
        return;
      }
      let data: any;
      if (contentType.includes('yaml') || contentType.includes('x-yaml') || contentType.includes('text/plain')) {
        data = parseYaml(body);
      } else {
        data = JSON.parse(body);
      }
      const collection = parseOpenApiCollection(data);
      if (!collection) {
        vscode.window.showErrorMessage('Import failed: URL did not return a valid OpenAPI / Swagger document');
        return;
      }
      const existing = this.storage.getCollections().find((c) => c.name === collection.name);
      this.storage.saveCollection({
        ...collection,
        id: existing?.id || collection.id,
      });
      const total = collection.requests.length + (collection.groups || []).reduce((s: number, g: any) => s + (g.requests?.length || 0), 0);
      const groupCount = (collection.groups || []).length;
      vscode.window.showInformationMessage(
        `\u2713 Imported "${collection.name}" with ${total} endpoint(s)${groupCount ? ` in ${groupCount} group(s)` : ''}`
      );
    } catch (e: any) {
      vscode.window.showErrorMessage(`Import failed: ${e?.message || 'network error'}`);
    }
  }
}
