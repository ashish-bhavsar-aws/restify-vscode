const vscode = require('vscode');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { getMainPanelHtml } = require('./mainPanelHtml');

class RestifyPanel {
  constructor(context, storageManager, onDispose) {
    this.context = context;
    this.storageManager = storageManager;
    this.onDispose = onDispose;

    this.panel = vscode.window.createWebviewPanel(
      'restify-main',
      'Restify',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri]
      }
    );

    this.panel.webview.html = getMainPanelHtml();

    this.panel.webview.onDidReceiveMessage(msg => this._handleMessage(msg));
    this.panel.onDidDispose(() => {
      this.onDispose();
    });

    // Send current environments on load
    setTimeout(() => {
      this._sendEnvironments();
    }, 500);
  }

  loadRequest(requestData) {
    setTimeout(() => {
      this.panel.webview.postMessage({ command: 'loadRequest', data: requestData });
    }, 300);
  }

  _sendEnvironments() {
    this.panel.webview.postMessage({
      command: 'setEnvironments',
      environments: this.storageManager.getEnvironments(),
      activeEnvId: this.storageManager.getActiveEnvironment()?.id || null
    });
  }

  async _handleMessage(msg) {
    switch (msg.command) {
      case 'executeRequest':
        await this._executeRequest(msg.request);
        break;
      case 'saveToCollection':
        this._saveToCollection(msg.request, msg.collectionName);
        break;
      case 'getCollections':
        this.panel.webview.postMessage({
          command: 'collections',
          data: this.storageManager.getCollections()
        });
        break;
      case 'getEnvironments':
        this._sendEnvironments();
        break;
      case 'setActiveEnvironment':
        this.storageManager.setActiveEnvironment(msg.id);
        this._sendEnvironments();
        break;
    }
  }

  async _executeRequest(req) {
    const startTime = Date.now();

    // Resolve env variables
    const resolveVars = (s) => this.storageManager.resolveVariables(s || '');

    const rawUrl = resolveVars(req.url);
    const method = req.method || 'GET';
    const headers = {};

    (req.headers || []).forEach(h => {
      if (h.key && h.enabled !== false) {
        headers[resolveVars(h.key)] = resolveVars(h.value);
      }
    });

    let body = undefined;
    if (req.bodyType === 'json' && req.body) {
      body = resolveVars(req.body);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (req.bodyType === 'form' && req.formData) {
      const params = new URLSearchParams();
      (req.formData || []).forEach(f => {
        if (f.key) params.append(resolveVars(f.key), resolveVars(f.value));
      });
      body = params.toString();
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (req.bodyType === 'text' && req.body) {
      body = resolveVars(req.body);
    } else if (req.bodyType === 'xml' && req.body) {
      body = resolveVars(req.body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/xml';
    }

    // Handle query params
    let finalUrl = rawUrl;
    if (req.queryParams && req.queryParams.length > 0) {
      try {
        const urlObj = new URL(rawUrl);
        req.queryParams.forEach(p => {
          if (p.key && p.enabled !== false) {
            urlObj.searchParams.append(resolveVars(p.key), resolveVars(p.value));
          }
        });
        finalUrl = urlObj.toString();
      } catch (e) {
        // URL might have query string already
      }
    }

    // Notify panel: loading
    this.panel.webview.postMessage({ command: 'requestStart' });

    try {
      const result = await this._doRequest(method, finalUrl, headers, body, req.rejectUnauthorized !== false ? false : true);
      const duration = Date.now() - startTime;

      const responseData = {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        body: result.body,
        duration,
        size: Buffer.byteLength(result.body || '', 'utf8')
      };

      this.panel.webview.postMessage({ command: 'requestComplete', response: responseData });

      // Save to history
      this.storageManager.addToHistory({
        method,
        url: finalUrl,
        name: req.name || `${method} ${finalUrl}`,
        status: result.status,
        duration,
        request: req,
        response: responseData
      });

    } catch (err) {
      const duration = Date.now() - startTime;
      this.panel.webview.postMessage({
        command: 'requestError',
        error: err.message,
        duration
      });

      this.storageManager.addToHistory({
        method,
        url: finalUrl,
        name: req.name || `${method} ${finalUrl}`,
        status: 0,
        error: err.message,
        duration,
        request: req
      });
    }
  }

  _doRequest(method, url, headers, body, rejectUnauthorized) {
    return new Promise((resolve, reject) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (e) {
        return reject(new Error(`Invalid URL: ${url}`));
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers,
        // Self-signed certificate support
        rejectUnauthorized: rejectUnauthorized === true ? true : false
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            body: data
          });
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timed out after 30 seconds'));
      });

      if (body) req.write(body);
      req.end();
    });
  }

  _saveToCollection(request, collectionName) {
    const collections = this.storageManager.getCollections();
    let col = collections.find(c => c.name === collectionName);

    if (!col) {
      const newCol = {
        id: Date.now().toString(),
        name: collectionName,
        requests: []
      };
      this.storageManager.saveCollection(newCol);
      col = this.storageManager.getCollections().find(c => c.name === collectionName);
    }

    if (col) {
      this.storageManager.addRequestToCollection(col.id, {
        ...request,
        name: request.name || `${request.method} ${request.url}`,
        id: Date.now().toString()
      });
    }

    vscode.window.showInformationMessage(`✓ Saved to collection "${collectionName}"`);
  }
}

module.exports = { RestifyPanel };
