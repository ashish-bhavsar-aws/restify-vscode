const vscode = require('vscode');
const https = require('https');
const http = require('http');
const fs = require('fs'); // New: required to read cert files
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

  // Helper to determine if the proxy should be bypassed for a host
  _shouldUseProxy(host, noProxyArray) {
    if (!noProxyArray || !Array.isArray(noProxyArray)) return true;
    return !noProxyArray.some(noHost => {
      const sanitizedNoHost = noHost.trim().toLowerCase();
      return host === sanitizedNoHost || host.endsWith('.' + sanitizedNoHost);
    });
  }

  _getCertificatesForHost(host) {
    const config = vscode.workspace.getConfiguration('restify').get('certificates') || {};
    // Match exact host or find if host ends with the config key (for wildcards)
    const hostMatch = Object.keys(config).find(key => 
        host === key || host.endsWith('.' + key)
    );

    if (hostMatch) {
        const certConfig = config[hostMatch];
        try {
            const options = {};
            if (certConfig.certPath) options.cert = fs.readFileSync(certConfig.certPath);
            if (certConfig.keyPath) options.key = fs.readFileSync(certConfig.keyPath);
            if (certConfig.caPath) options.ca = fs.readFileSync(certConfig.caPath);
            return options;
        } catch (err) {
            console.error(`Failed to read certificates for ${host}:`, err);
            return null;
        }
    }
    return null;
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
      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'restify');
        break;
      case 'configureProxy':
        await this._initializeProxySettings();
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

  async _initializeProxySettings() {
    const config = vscode.workspace.getConfiguration('restify');
    const existingProxy = config.get('proxy');

    if (!existingProxy || Object.keys(existingProxy).length === 0) {
      await config.update('proxy', {
        "http.proxyAuthorization": null,
        "http.proxy": "https://abc.com:8080",
        "http.noProxy": ["abc.com"]
      }, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('Proxy configuration initialized in settings.json');
    }
    vscode.commands.executeCommand('workbench.action.openSettings', 'restify.proxy');
  }

  async _executeRequest(req) {
    const startTime = Date.now();
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
    } else if (req.bodyType === 'text' || req.bodyType === 'xml') {
      body = resolveVars(req.body);
      if (req.bodyType === 'xml' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/xml';
      }
    }

    let finalUrl = rawUrl;
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
      if (req.queryParams && req.queryParams.length > 0) {
        req.queryParams.forEach(p => {
          if (p.key && p.enabled !== false) {
            parsedUrl.searchParams.append(resolveVars(p.key), resolveVars(p.value));
          }
        });
        finalUrl = parsedUrl.toString();
      }
    } catch (e) {
      this.panel.webview.postMessage({ command: 'requestError', error: 'Invalid URL', duration: 0 });
      return;
    }

    // Proxy Logic Implementation
    const proxyConfig = vscode.workspace.getConfiguration('restify').get('proxy');
    let proxyOpts = null;

    if (proxyConfig && proxyConfig['http.proxy']) {
      if (this._shouldUseProxy(parsedUrl.hostname.toLowerCase(), proxyConfig['http.noProxy'])) {
        proxyOpts = {
          proxy: proxyConfig['http.proxy'],
          auth: proxyConfig['http.proxyAuthorization']
        };
      }
    }

    this.panel.webview.postMessage({ command: 'requestStart' });

    try {
      const result = await this._doRequest(
        method, 
        finalUrl, 
        headers, 
        body, 
        req.rejectUnauthorized === true, 
        proxyOpts
      );
      
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
      this.panel.webview.postMessage({ command: 'requestError', error: err.message, duration });
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

  _doRequest(method, url, headers, body, rejectUnauthorized, proxyOpts) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      
      let options = {
        method,
        headers,
        rejectUnauthorized: rejectUnauthorized === true
      };

      // --- New: mTLS Logic ---
      if (isHttps) {
        const mtlsOptions = this._getCertificatesForHost(parsedUrl.hostname);
        if (mtlsOptions) {
          Object.assign(options, mtlsOptions);
        }
      }
      // -----------------------

      // Configuration for Proxy Request
      if (proxyOpts && proxyOpts.proxy) {
        try {
          const proxyUrl = new URL(proxyOpts.proxy);
          options.hostname = proxyUrl.hostname;
          options.port = proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80);
          options.path = url; // Full URL required for proxy requests

          if (proxyOpts.auth) {
            options.headers['Proxy-Authorization'] = proxyOpts.auth;
          }
        } catch (e) {
          return reject(new Error('Invalid Proxy URL configuration'));
        }
      } else {
        options.hostname = parsedUrl.hostname;
        options.port = parsedUrl.port || (isHttps ? 443 : 80);
        options.path = parsedUrl.pathname + parsedUrl.search;
      }

      const lib = isHttps ? https : http;
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
      const newCol = { id: Date.now().toString(), name: collectionName, requests: [] };
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