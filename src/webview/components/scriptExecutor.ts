/**
 * Script Executor — template only.
 * Actual execution is delegated to the extension host (RestifyPanel._runScript)
 * via the 'runScript' / 'scriptResult' message protocol to avoid webview CSP limits.
 */

export function getScriptTemplate(): string {
  return `// Post-response script
// Available variables:
//   response.status      — HTTP status code (number)
//   response.statusText  — e.g. "OK"
//   response.headers     — object of response headers
//   response.body        — parsed JSON object (if JSON), otherwise raw string
//   response.rawBody     — always the raw response string
//   vars                 — shorthand to set/read environment variables
//   set(key, value)      — same as vars[key] = value
//   log(...)             — write to Script Logs in Response pane

if (response.status === 200) {
  // Access JSON fields directly
  vars['token'] = response.body.access_token;
  vars['userId'] = response.body.user?.id;

  log('Extracted token:', vars['token']);
}
`;
}
