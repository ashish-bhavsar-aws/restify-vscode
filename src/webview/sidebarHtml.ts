import * as vscode from 'vscode';

export function getSidebarHtml(
  type: string,
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist/webview', 'sidebar.js')
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist/webview', 'sidebar.css')
  );

  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${cssUri}">
  <title>Restify ${type}</title>
</head>
<body>
  <div id="root" data-type="${type}"></div>
  <script nonce="${nonce}" src="${scriptUri}"><\/script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
