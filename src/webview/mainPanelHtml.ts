import * as vscode from 'vscode';

export function getMainPanelHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist/webview', 'mainPanel.js')
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist/webview', 'mainPanel.css')
  );

  const nonce = getNonce();

  const sidebarIconUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg')
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval'; worker-src ${webview.cspSource} blob:;" />
  <link rel="stylesheet" href="${cssUri}">
  <title>Restify</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.restifyMedia = {
    sidebarIcon: "${sidebarIconUri}"
  };</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}


