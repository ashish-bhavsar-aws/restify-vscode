import { Environment, RequestState, DefaultHeadersConfig, KVItem } from '../types';
import { previewDynamicVariable } from '../../core/dynamicVarTokens';

export const SUPPORTED_LANGS: Array<{ id: string; label: string }> = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript-fetch', label: 'JavaScript (fetch)' },
  { id: 'javascript-axios', label: 'JavaScript (axios)' },
  { id: 'node-fetch', label: 'Node.js (node-fetch)' },
  { id: 'python-requests', label: 'Python (requests)' },
  { id: 'java-okhttp', label: 'Java (OkHttp)' },
  { id: 'swift-urlsession', label: 'Swift (URLSession)' },
  { id: 'go-http', label: 'Go (net/http)' },
  { id: 'powershell', label: 'PowerShell (Invoke-RestMethod)' },
  { id: 'php-curl', label: 'PHP (cURL)' },
  { id: 'csharp-httpclient', label: 'C# (HttpClient)' },
  { id: 'typescript-fetch', label: 'TypeScript (fetch)' },
  { id: 'dart', label: 'Dart (http)' },
  { id: 'ruby', label: 'Ruby (Net::HTTP)' },
  { id: 'rust', label: 'Rust (reqwest)' },
  { id: 'kotlin-okhttp', label: 'Kotlin (OkHttp)' },
  { id: 'httpie', label: 'HTTPie (http CLI)' },
];

function headerObj(headers: Array<{ key?: string; value?: string; enabled?: boolean }>) {
  const obj: Record<string, string> = {};
  (headers || []).forEach((h) => {
    if (h.key && h.enabled !== false) obj[h.key] = h.value || '';
  });
  return obj;
}

function objectLiteral(obj: Record<string, string>): string {
  const parts = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{ ${parts.join(', ')} }`;
}

function resolveVariables(text: string | undefined, environment?: Environment | null): string {
  if (!text || !environment?.variables) return text || '';

  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, name) => {
    const variable = environment.variables.find((item) => item.key === String(name).trim());
    return variable ? variable.value || '' : match;
  });
}

const DYNAMIC_SAMPLE_PATTERN =
  /\{\{\$(processEnv(?::[^}]*)?|guid|timestamp|randomInt|randomAlpha|randomHex|localDateTime)\}\}/g;

function substituteDynamicVars(
  text: string | undefined,
  substitutions: Array<{ token: string; sample: string }>,
): string {
  if (!text) return text || '';
  return text.replace(DYNAMIC_SAMPLE_PATTERN, (match, name: string) => {
    const sample = previewDynamicVariable(name);
    if (sample !== match) substitutions.push({ token: match, sample });
    return sample;
  });
}

function resolveRequest(
  req: RequestState,
  environment?: Environment | null,
): { req: RequestState; substitutions: Array<{ token: string; sample: string }> } {
  const substitutions: Array<{ token: string; sample: string }> = [];
  const resolve = (text?: string) =>
    substituteDynamicVars(resolveVariables(text, environment), substitutions);

  return {
    substitutions,
    req: {
      ...req,
      url: resolve(req.url),
      body: resolve(req.body),
      gqlQuery: resolve(req.gqlQuery),
      gqlVars: resolve(req.gqlVars),
      headers: (req.headers || []).map((item) => ({
        ...item,
        key: resolve(item.key),
        value: resolve(item.value),
      })),
      queryParams: (req.queryParams || []).map((item) => ({
        ...item,
        key: resolve(item.key),
        value: resolve(item.value),
      })),
      formData: (req.formData || []).map((item) => ({
        ...item,
        key: resolve(item.key),
        value: resolve(item.value),
        fileName: resolve(item.fileName),
        contentType: resolve(item.contentType),
      })),
      urlencoded: (req.urlencoded || []).map((item) => ({
        ...item,
        key: resolve(item.key),
        value: resolve(item.value),
      })),
      authData: {
        ...req.authData,
        token: resolve(req.authData.token),
        username: resolve(req.authData.username),
        password: resolve(req.authData.password),
        keyName: resolve(req.authData.keyName),
        keyValue: resolve(req.authData.keyValue),
      },
    },
  };
}

function buildDefaultHeaders(
  defaultHeaders?: DefaultHeadersConfig,
): Record<string, string> {
  if (!defaultHeaders) return {};
  const out: Record<string, string> = {};
  if (defaultHeaders.userAgent) out['User-Agent'] = 'Restify';
  if (defaultHeaders.requestId) out['X-Request-Id'] = previewDynamicVariable('guid');
  if (defaultHeaders.correlationId) out['X-Correlation-Id'] = previewDynamicVariable('guid');
  if (defaultHeaders.date) out['Date'] = new Date().toUTCString();
  return out;
}

/** Merges default headers (lowest precedence) into the explicit header list. */
function mergeDefaultHeaders(
  headers: RequestState['headers'],
  defaultHeaders?: DefaultHeadersConfig,
): RequestState['headers'] {
  const defaults = buildDefaultHeaders(defaultHeaders);
  if (Object.keys(defaults).length === 0) return headers;
  const present = new Set((headers || []).map((h) => h.key?.toLowerCase()));
  const toAdd: RequestState['headers'] = Object.entries(defaults)
    .filter(([k]) => !present.has(k.toLowerCase()))
    .map(([key, value]) => ({ key, value, enabled: true }));
  return [...headers, ...toAdd];
}

const COMMENT_PREFIX: Record<string, string> = {
  curl: '#',
  'javascript-fetch': '//',
  'javascript-axios': '//',
  'node-fetch': '//',
  'python-requests': '#',
  'java-okhttp': '//',
  'swift-urlsession': '//',
  'go-http': '//',
  powershell: '#',
  'php-curl': '//',
  'csharp-httpclient': '//',
  'typescript-fetch': '//',
  dart: '//',
  ruby: '#',
  rust: '//',
  'kotlin-okhttp': '//',
  httpie: '#',
};

function buildSubstitutionNote(
  lang: string,
  substitutions: Array<{ token: string; sample: string }>,
): string {
  if (substitutions.length === 0) return '';
  const prefix = COMMENT_PREFIX[lang] || '//';
  const lines = substitutions.map((s) => `${prefix}   ${s.token}  ->  ${s.sample}`);
  return [
    `${prefix} Dynamic variables were substituted with sample values at generation time:`,
    ...lines,
    `${prefix} Replace them with runtime-generated values to get a fresh value per request.`,
    '',
  ].join('\n');
}

function getEnabledFormFields(req: RequestState) {
  return (req.formData || []).filter((field) => field.key && field.enabled !== false);
}

function isMultipartFormRequest(req: RequestState): boolean {
  return req.bodyType === 'form' && getEnabledFormFields(req).some((field) => (field.formType || 'text') === 'file');
}

function escapeShellArg(value: string): string {
  return String(value).replace(/"/g, '\\"');
}
function filterContentTypeHeader(headers: Record<string, string>, isMultipart: boolean): Record<string, string> {
  if (!isMultipart) return headers;
  return Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-type'));
}

function getAuthHeaders(req: RequestState): Record<string, string> {
  const authHeaders: Record<string, string> = {};
  if (req.authType === 'bearer' && req.authData.token) {
    authHeaders.Authorization = `Bearer ${req.authData.token}`;
  } else if (req.authType === 'basic' && req.authData.username) {
    const creds = btoa(`${req.authData.username}:${req.authData.password ?? ''}`);
    authHeaders.Authorization = `Basic ${creds}`;
  } else if (req.authType === 'apikey' && req.authData.keyName && req.authData.addTo !== 'query') {
    authHeaders[req.authData.keyName] = req.authData.keyValue ?? '';
  }
  return authHeaders;
}

function getContentTypeHeader(req: RequestState, isMultipart: boolean): Record<string, string> {
  if (req.bodyType === 'json') {
    return { 'Content-Type': 'application/json' };
  }
  if (req.bodyType === 'form') {
    return isMultipart ? { 'Content-Type': 'multipart/form-data' } : { 'Content-Type': 'application/x-www-form-urlencoded' };
  }
  if (req.bodyType === 'urlencoded') {
    return { 'Content-Type': 'application/x-www-form-urlencoded' };
  }
  if (req.bodyType === 'xml') {
    return { 'Content-Type': 'application/xml' };
  }
  if (req.bodyType === 'text') {
    return { 'Content-Type': 'text/plain' };
  }
  if (req.bodyType === 'graphql') {
    return { 'Content-Type': 'application/json' };
  }
  return {};
}

function buildHeaders(req: RequestState, isMultipart: boolean): Record<string, string> {
  const explicitHeaders = headerObj(req.headers || []);
  const authHeaders = getAuthHeaders(req);
  const contentTypeHeaders = getContentTypeHeader(req, isMultipart);
  const merged: Record<string, string> = { ...explicitHeaders, ...authHeaders };
  if (!Object.keys(merged).some((k) => k.toLowerCase() === 'content-type')) {
    Object.assign(merged, contentTypeHeaders);
  }
  return merged;
}

function serializeUrlEncodedFields(
  items: Array<KVItem> | undefined,
): string {
  return (items || [])
    .filter((item) => item.key && item.enabled !== false)
    .map(
      (item) =>
        `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value || '')}`,
    )
    .join('&');
}

function buildGraphqlBody(req: RequestState): string {
  const query = (req.gqlQuery || '').trim();
  if (!query) return '';
  const payload: Record<string, unknown> = { query };
  const vars = (req.gqlVars || '').trim();
  if (vars) {
    try {
      payload.variables = JSON.parse(vars);
    } catch {
      payload.variables = vars;
    }
  }
  return JSON.stringify(payload);
}

export function generateCode(
  lang: string,
  request: RequestState,
  environment?: Environment | null,
  defaultHeaders?: DefaultHeadersConfig,
): string {
  const { req, substitutions } = resolveRequest(request, environment);
  req.headers = mergeDefaultHeaders(req.headers, defaultHeaders);
  const code = generateCodeBody(lang, req);
  const note = buildSubstitutionNote(lang, substitutions);
  return note ? `${note}${code}` : code;
}

function generateCodeBody(lang: string, req: RequestState): string {
  const method = req.method || 'GET';
  const enabledParams = (req.queryParams || []).filter((p) => p.key && p.enabled !== false);
  const authQueryParam =
    req.authType === 'apikey' && req.authData.addTo === 'query' && req.authData.keyName
      ? { key: req.authData.keyName, value: req.authData.keyValue ?? '' }
      : null;
  const urlParams = authQueryParam ? [...enabledParams, authQueryParam] : enabledParams;
  let url = req.url || '';
  if (urlParams.length > 0) {
    const queryString = urlParams
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    url += (url.includes('?') ? '&' : '?') + queryString;
  }
  const enabledFormFields = getEnabledFormFields(req);
  const isMultipart = isMultipartFormRequest(req);
  const headers = buildHeaders(req, isMultipart);
  const relevantHeaders = filterContentTypeHeader(headers, isMultipart);

  let body = req.body || '';
  if (req.bodyType === 'graphql') {
    body = buildGraphqlBody(req);
  } else if (req.bodyType === 'urlencoded') {
    body = serializeUrlEncodedFields(req.urlencoded);
  } else if (req.bodyType === 'form' && !isMultipart && enabledFormFields.length > 0) {
    body = serializeUrlEncodedFields(enabledFormFields);
  }

  switch (lang) {
    case 'curl': {
      let cmd = `curl -X ${method}`;
      Object.entries(relevantHeaders).forEach(([k, v]) => {
        cmd += ` -H "${k}: ${v.replace(/"/g, '\\"')}"`;
      });
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        enabledFormFields.forEach((field) => {
          const key = field.key || 'field';
          if ((field.formType || 'text') === 'file') {
            const filePath = field.fileName || '/path/to/file';
            const contentType = field.contentType || 'application/octet-stream';
            cmd += ` -F "${key}=@${escapeShellArg(filePath)};type=${contentType}"`;
          } else {
            const value = escapeShellArg(field.value || '');
            if (field.contentType) {
              cmd += ` -F "${key}=${value};type=${field.contentType}"`;
            } else {
              cmd += ` -F "${key}=${value}"`;
            }
          }
        });
      } else if (body && method !== 'GET' && method !== 'HEAD') {
        const escaped = String(body).replace(/'/g, "'\\''");
        cmd += ` -d '${escaped}'`;
      }
      cmd += ` "${url}"`;
      return cmd;
    }

    case 'javascript-fetch': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0) {
        if (isMultipart) {
          const formLines = enabledFormFields.map((field) => {
            const key = JSON.stringify(field.key || 'field');
            if ((field.formType || 'text') === 'file') {
              return `form.append(${key}, fileInput.files[0]);`;
            }
            const comment = field.contentType ? ` // type=${field.contentType}` : '';
            return `form.append(${key}, ${JSON.stringify(field.value || '')});${comment}`;
          }).join('\n');
          const headerLines = JSON.stringify(relevantHeaders, null, 2);
          return `const form = new FormData();
${formLines}

fetch(${JSON.stringify(url)}, {
  method: ${JSON.stringify(method)},
  headers: ${headerLines},
  body: form,
})
  .then(res => res.text())
  .then(console.log)
  .catch(console.error);
`;
        }
        const encodedBody = enabledFormFields.map((field) => `${encodeURIComponent(field.key || 'field')}=${encodeURIComponent(field.value || '')}`).join('&');
        const headerLines = JSON.stringify(relevantHeaders, null, 2);
        return `fetch(${JSON.stringify(url)}, {
  method: ${JSON.stringify(method)},
  headers: ${headerLines},
  body: ${JSON.stringify(encodedBody)},
})
  .then(res => res.text())
  .then(console.log)
  .catch(console.error);
`;
      }
      const bodyLine = body && method !== 'GET' && method !== 'HEAD' ? `  body: ${JSON.stringify(body)},\n` : '';
      const headerLines = JSON.stringify(relevantHeaders, null, 2);
      return `fetch(${JSON.stringify(url)}, {
  method: ${JSON.stringify(method)},
  headers: ${headerLines},
${bodyLine}})
  .then(res => res.text())
  .then(console.log)
  .catch(console.error);
`;
    }

    case 'javascript-axios': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0) {
        if (isMultipart) {
          const formLines = enabledFormFields.map((field) => {
            const key = JSON.stringify(field.key || 'field');
            if ((field.formType || 'text') === 'file') {
              return `form.append(${key}, fileInput.files[0]);`;
            }
            return `form.append(${key}, ${JSON.stringify(field.value || '')});`;
          }).join('\n');
          const headerLines = JSON.stringify(relevantHeaders, null, 2);
          return `import axios from 'axios';

const form = new FormData();
${formLines}

axios({
  method: ${JSON.stringify(method)},
  url: ${JSON.stringify(url)},
  headers: ${headerLines},
  data: form,
})
  .then(res => console.log(res.data))
  .catch(err => console.error(err));
`;
        }
        const encodedBody = enabledFormFields.map((field) => `${encodeURIComponent(field.key || 'field')}=${encodeURIComponent(field.value || '')}`).join('&');
        const headerLines = JSON.stringify(relevantHeaders, null, 2);
        return `import axios from 'axios';

axios({
  method: ${JSON.stringify(method)},
  url: ${JSON.stringify(url)},
  headers: ${headerLines},
  data: ${JSON.stringify(encodedBody)},
})
  .then(res => console.log(res.data))
  .catch(err => console.error(err));
`;
      }
      const bodyPart = body && method !== 'GET' && method !== 'HEAD' ? `data: ${JSON.stringify(body)},` : '';
      const headerLines = JSON.stringify(relevantHeaders, null, 2);
      return `import axios from 'axios';

axios({
  method: ${JSON.stringify(method)},
  url: ${JSON.stringify(url)},
  headers: ${headerLines},
  ${bodyPart}
})
  .then(res => console.log(res.data))
  .catch(err => console.error(err));
`;
    }

    case 'node-fetch': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0) {
        if (isMultipart) {
          const formLines = enabledFormFields.map((field) => {
            const key = JSON.stringify(field.key || 'field');
            if ((field.formType || 'text') === 'file') {
              const comment = field.contentType ? `, { contentType: ${JSON.stringify(field.contentType)} }` : '';
              return `form.append(${key}, fs.createReadStream('/path/to/file')${comment})`;
            }
            const comment = field.contentType ? ` // type=${field.contentType}` : '';
            return `form.append(${key}, ${JSON.stringify(field.value || '')});${comment}`;
          }).join('\n');
          const headerLines = JSON.stringify(relevantHeaders, null, 2);
          return `import fetch from 'node-fetch';
import fs from 'fs';

(async () => {
  const form = new FormData();
${formLines}
  const res = await fetch(${JSON.stringify(url)}, {
    method: ${JSON.stringify(method)},
    headers: ${headerLines},
    body: form,
  });
  const text = await res.text();
  console.log(text);
})();
`;
        }
        const encodedBody = enabledFormFields.map((field) => `${encodeURIComponent(field.key || 'field')}=${encodeURIComponent(field.value || '')}`).join('&');
        const headerLines = JSON.stringify(relevantHeaders, null, 2);
        return `import fetch from 'node-fetch';

(async () => {
  const res = await fetch(${JSON.stringify(url)}, {
    method: ${JSON.stringify(method)},
    headers: ${headerLines},
    body: ${JSON.stringify(encodedBody)},
  });
  const text = await res.text();
  console.log(text);
})();
`;
      }
      const bodyLine = body && method !== 'GET' && method !== 'HEAD' ? `  body: ${JSON.stringify(body)},\n` : '';
      const headerLines = JSON.stringify(relevantHeaders, null, 2);
      return `import fetch from 'node-fetch';

(async () => {
  const res = await fetch(${JSON.stringify(url)}, {
    method: ${JSON.stringify(method)},
    headers: ${headerLines},
${bodyLine}  });
  const text = await res.text();
  console.log(text);
})();
`;
    }

    case 'python-requests': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0) {
        if (isMultipart) {
          const hasCustomContentTypes = enabledFormFields.some((f) => f.contentType && (f.formType || 'text') !== 'file');
          const dataLines = enabledFormFields.filter((field) => (field.formType || 'text') !== 'file').map((field) => {
            const comment = field.contentType ? ` # type=${field.contentType}` : '';
            return `    ${JSON.stringify(field.key || 'field')}: ${JSON.stringify(field.value || '')},${comment}`;
          }).join('\n');
          const fileLines = enabledFormFields.filter((field) => (field.formType || 'text') === 'file').map((field) => {
            const comment = field.contentType ? ` # type=${field.contentType}` : '';
            const fileName = field.fileName || 'file';
            return `    ${JSON.stringify(field.key || 'field')}: (${JSON.stringify(fileName)}, open(${JSON.stringify(fileName)}, 'rb')),${comment}`;
          }).join('\n');
          const toolbeltNote = hasCustomContentTypes ? `\n# Note: For custom content types per field, install requests-toolbelt:\n# pip install requests-toolbelt\n# Then use MultipartEncoder instead of the simple approach below\n` : '';
          return `import requests${toolbeltNote}
url = ${JSON.stringify(url)}
headers = ${JSON.stringify(relevantHeaders, null, 2)}

data = {
${dataLines}
}
files = {
${fileLines}
}

resp = requests.request(${JSON.stringify(method)}, url, headers=headers, data=data, files=files)
print(resp.status_code)
print(resp.text)
`;
        }
        const encodedBody = enabledFormFields.map((field) => `${encodeURIComponent(field.key || 'field')}=${encodeURIComponent(field.value || '')}`).join('&');
        return `import requests

url = ${JSON.stringify(url)}
headers = ${JSON.stringify(relevantHeaders, null, 2)}

resp = requests.request(${JSON.stringify(method)}, url, headers=headers, data=${JSON.stringify(encodedBody)})
print(resp.status_code)
print(resp.text)
`;
      }
      const hasBody = body && method !== 'GET' && method !== 'HEAD';
      return `import requests

url = ${JSON.stringify(url)}
headers = ${JSON.stringify(relevantHeaders, null, 2)}

resp = requests.request(${JSON.stringify(method)}, url, headers=headers${hasBody ? `, data=${JSON.stringify(body)}` : ''})
print(resp.status_code)
print(resp.text)
`;
    }

    case 'java-okhttp': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        const multipartLines = enabledFormFields.map((field) => {
          const key = JSON.stringify(field.key || 'field');
          if ((field.formType || 'text') === 'file') {
            return `builder.addFormDataPart(${key}, ${JSON.stringify(field.fileName || 'upload.bin')}, RequestBody.create(new byte[0], MediaType.parse(${JSON.stringify(field.contentType || 'application/octet-stream')})));`;
          }
          if (field.contentType) {
            return `builder.addFormDataPart(${key}, ${JSON.stringify(field.value || '')}, RequestBody.create(${JSON.stringify(field.value || '')}, MediaType.parse(${JSON.stringify(field.contentType)})));`;
          }
          return `builder.addFormDataPart(${key}, ${JSON.stringify(field.value || '')});`;
        }).join('\n  ');
        const headerLines = Object.entries(relevantHeaders).map(([k, v]) => `.add(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('');
        return `import okhttp3.*;
import java.io.IOException;

OkHttpClient client = new OkHttpClient();
MultipartBody.Builder builder = new MultipartBody.Builder().setType(MultipartBody.FORM);
  ${multipartLines}
RequestBody body = builder.build();
Request request = new Request.Builder()
  .url(${JSON.stringify(url)})
  .method(${JSON.stringify(method)}, body)
  .headers(new Headers.Builder()${headerLines}.build())
  .build();

try (Response response = client.newCall(request).execute()) {
  System.out.println(response.body().string());
}
`;
      }
      const bodyPart = body && method !== 'GET' && method !== 'HEAD' ? `RequestBody.create(${JSON.stringify(body)}, okhttp3.MediaType.parse(${JSON.stringify(headers['Content-Type'] || headers['content-type'] || 'text/plain')}))` : 'null';
      const headerLines = Object.entries(relevantHeaders).map(([k, v]) => `.add(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('');
      return `import okhttp3.*;
import java.io.IOException;

OkHttpClient client = new OkHttpClient();

RequestBody body = ${bodyPart};
Request request = new Request.Builder()
  .url(${JSON.stringify(url)})
  .method(${JSON.stringify(method)}, body)
  .headers(new Headers.Builder()${headerLines}.build())
  .build();

try (Response response = client.newCall(request).execute()) {
  System.out.println(response.body().string());
}
`;
    }

    case 'swift-urlsession': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        const boundaryMarker = String.fromCharCode(92) + '(boundary)';
        const uuidMarker = String.fromCharCode(92) + '(UUID().uuidString)';
        const fieldLines = enabledFormFields.map((field) => {
          const key = JSON.stringify(field.key || 'field');
          if ((field.formType || 'text') === 'file') {
            return `multipart.append("--${boundaryMarker}\r\n".data(using: .utf8)!)
multipart.append("Content-Disposition: form-data; name=${key}; filename=${JSON.stringify(field.fileName || 'upload.bin')}\r\n".data(using: .utf8)!)
multipart.append("Content-Type: ${field.contentType || 'application/octet-stream'}\r\n\r\n".data(using: .utf8)!)
multipart.append(Data())
multipart.append("\r\n".data(using: .utf8)!)`;
          }
          return `multipart.append("--${boundaryMarker}\r\n".data(using: .utf8)!)
multipart.append("Content-Disposition: form-data; name=${key}\r\n\r\n".data(using: .utf8)!)
multipart.append(${JSON.stringify(field.value || '')}.data(using: .utf8)!)
multipart.append("\r\n".data(using: .utf8)!)`;
        }).join('\n  ');
        const headerLines = Object.entries(relevantHeaders).map(([k, v]) => `request.setValue(${JSON.stringify(v)}, forHTTPHeaderField: ${JSON.stringify(k)})`).join('\n');
        return `import Foundation

let url = URL(string: ${JSON.stringify(url)})!
var request = URLRequest(url: url)
request.httpMethod = ${JSON.stringify(method)}
${headerLines}

var multipart = Data()
let boundary = "Boundary-${uuidMarker}"
${fieldLines}
multipart.append("--${boundaryMarker}--\r\n".data(using: .utf8)!)
request.setValue("multipart/form-data; boundary=${boundaryMarker}", forHTTPHeaderField: "Content-Type")
request.httpBody = multipart

let task = URLSession.shared.dataTask(with: request) { data, response, error in
  if let error = error {
    print(error)
    return
  }
  if let data = data, let s = String(data: data, encoding: .utf8) {
    print(s)
  }
}
task.resume()
`;
      }
      const headerLines = Object.entries(relevantHeaders).map(([k, v]) => `request.setValue(${JSON.stringify(v)}, forHTTPHeaderField: ${JSON.stringify(k)})`).join('\n');
      const bodyLine = body && method !== 'GET' && method !== 'HEAD' ? `request.httpBody = ${JSON.stringify(body)}.data(using: .utf8)` : '';
      return `import Foundation

let url = URL(string: ${JSON.stringify(url)})!
var request = URLRequest(url: url)
request.httpMethod = ${JSON.stringify(method)}
${headerLines}
${bodyLine}

let task = URLSession.shared.dataTask(with: request) { data, response, error in
  if let error = error {
    print(error)
    return
  }
  if let data = data, let s = String(data: data, encoding: .utf8) {
    print(s)
  }
}
task.resume()
`;
    }

    case 'go-http': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        const hasCustomTypes = enabledFormFields.some((f) => f.contentType && (f.formType || 'text') === 'text');
        const parts = enabledFormFields.map((field) => {
          const key = JSON.stringify(field.key || 'field');
          if ((field.formType || 'text') === 'file') {
            return `writer.CreateFormFile(${key}, ${JSON.stringify(field.fileName || 'upload.bin')})`;
          }
          if (field.contentType && hasCustomTypes) {
            return `part, err := writer.CreatePart(textproto.MIMEHeader{"Content-Disposition": {"form-data; name=\\" + ${key} + "\\""}, "Content-Type": {${JSON.stringify(field.contentType)}}})
  if err != nil { panic(err) }
  part.Write([]byte(${JSON.stringify(field.value || '')}))`;
          }
          return `writer.WriteField(${key}, ${JSON.stringify(field.value || '')})`;
        }).join('\n  ');
        const headerLines = Object.entries(relevantHeaders).map(([k, v]) => `req.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('\n  ');
        const textprotoImport = hasCustomTypes ? `\n  "net/textproto"` : '';
        return `package main

import (
  "bytes"
  "fmt"
  "io"
  "mime/multipart"
  "net/http"${textprotoImport}
)

func main() {
  var body bytes.Buffer
  writer := multipart.NewWriter(&body)
  ${parts}
  writer.Close()

  req, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(url)}, &body)
  if err != nil {
    panic(err)
  }
  req.Header.Set("Content-Type", writer.FormDataContentType())
  ${headerLines}

  client := &http.Client{}
  resp, err := client.Do(req)
  if err != nil {
    panic(err)
  }
  defer resp.Body.Close()
  b, _ := io.ReadAll(resp.Body)
  fmt.Println(string(b))
}
`;
      }
      const headerLines = Object.entries(relevantHeaders).map(([k, v]) => `req.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('\n  ');
      const bodyLine = body && method !== 'GET' && method !== 'HEAD' ? `body := strings.NewReader(${JSON.stringify(body)})` : '';
      return `package main

import (
  "fmt"
  "io"
  "net/http"
  ${body ? '  "strings"' : ''}
)

func main() {
  ${bodyLine}
  req, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(url)}, ${body ? 'body' : 'nil'})
  if err != nil {
    panic(err)
  }
  ${headerLines}
  client := &http.Client{}
  resp, err := client.Do(req)
  if err != nil {
    panic(err)
  }
  defer resp.Body.Close()
  b, _ := io.ReadAll(resp.Body)
  fmt.Println(string(b))
}
`;
    }

    case 'powershell': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0) {
        if (isMultipart) {
          const psHeaderLiteral = '@{' + Object.entries(relevantHeaders).map(([k, v]) => `${JSON.stringify(k)}=${JSON.stringify(v)}`).join('; ') + '}';
          return `$url = ${JSON.stringify(url)}
$headers = ${psHeaderLiteral}
$form = @{${enabledFormFields.map((field) => `${JSON.stringify(field.key || 'field')} = ${JSON.stringify(field.value || '')}`).join('; ')}}
Invoke-RestMethod -Method ${method} -Uri $url -Headers $headers -Form $form
`;
        }
        const psHeaderLiteral = '@{' + Object.entries(relevantHeaders).map(([k, v]) => `${JSON.stringify(k)}=${JSON.stringify(v)}`).join('; ') + '}';
        const encodedBody = enabledFormFields.map((field) => `${encodeURIComponent(field.key || 'field')}=${encodeURIComponent(field.value || '')}`).join('&');
        return `$url = ${JSON.stringify(url)}
$headers = ${psHeaderLiteral}
$body = ${JSON.stringify(encodedBody)}
Invoke-RestMethod -Method ${method} -Uri $url -Headers $headers -Body $body
`;
      }
      const hasBody = body && method !== 'GET' && method !== 'HEAD';
      const psHeaderLiteral = '@{' + Object.entries(relevantHeaders).map(([k, v]) => `${JSON.stringify(k)}=${JSON.stringify(v)}`).join('; ') + '}';
      return `$url = ${JSON.stringify(url)}
$headers = ${psHeaderLiteral}
${hasBody ? `$body = ${JSON.stringify(body)}
Invoke-RestMethod -Method ${method} -Uri $url -Headers $headers -Body $body` : `Invoke-RestMethod -Method ${method} -Uri $url -Headers $headers`}
`;
    }

    case 'php-curl': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        const postFields = enabledFormFields.map((field) => {
          const key = JSON.stringify(field.key || 'field');
          if ((field.formType || 'text') === 'file') {
            return `${key} => new CURLFile('/path/to/file', ${JSON.stringify(field.contentType || 'application/octet-stream')}, ${JSON.stringify(field.fileName || 'file')})`;
          }
          return `${key} => ${JSON.stringify(field.value || '')}`;
        }).join(',\n  ');
        const headerLines = Object.entries(relevantHeaders).map(([k, v]) => JSON.stringify(`${k}: ${v}`)).join(',\n  ');
        return `<?php
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, ${JSON.stringify(url)});
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${JSON.stringify(method)});
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
${headerLines ? `curl_setopt($ch, CURLOPT_HTTPHEADER, [\n  ${headerLines}\n]);` : ''}
curl_setopt($ch, CURLOPT_POSTFIELDS, [
  ${postFields}
]);
$resp = curl_exec($ch);
curl_close($ch);
echo $resp;
?>
`;
      }
      const hasBody = body && method !== 'GET' && method !== 'HEAD';
      const headerLines = Object.entries(relevantHeaders).map(([k, v]) => JSON.stringify(`${k}: ${v}`)).join(',\n  ');
      return `<?php
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, ${JSON.stringify(url)});
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${JSON.stringify(method)});
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
${headerLines ? `curl_setopt($ch, CURLOPT_HTTPHEADER, [\n  ${headerLines}\n]);` : ''}
${hasBody ? `curl_setopt($ch, CURLOPT_POSTFIELDS, ${JSON.stringify(body)});` : ''}
$resp = curl_exec($ch);
curl_close($ch);
echo $resp;
?>
`;
    }

    case 'csharp-httpclient': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        const multipartLines = enabledFormFields.map((field) => {
          const key = JSON.stringify(field.key || 'field');
          if ((field.formType || 'text') === 'file') {
            return `form.Add(new ByteArrayContent(Array.Empty<byte>()), ${key}, ${JSON.stringify(field.fileName || 'upload.bin')});`;
          }
          return `form.Add(new StringContent(${JSON.stringify(field.value || '')}), ${key});`;
        }).join('\n    ');
        const headerLines = Object.entries(relevantHeaders).map(([k, v]) => `request.Headers.Add(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n    ');
        return `using System;
using System.Net.Http;
using System.Threading.Tasks;

class Program {
  static async Task Main() {
    using var client = new HttpClient();
    using var form = new MultipartFormDataContent();
    ${multipartLines}
    using var request = new HttpRequestMessage(HttpMethod.${method.toLowerCase() === 'get' ? 'Get' : method.charAt(0).toUpperCase() + method.slice(1).toLowerCase()}, ${JSON.stringify(url)});
    ${headerLines}
    request.Content = form;
    using var response = await client.SendAsync(request);
    var text = await response.Content.ReadAsStringAsync();
    Console.WriteLine(text);
  }
}
`;
      }
      const hasBody = body && method !== 'GET' && method !== 'HEAD';
      const headerLines = Object.entries(relevantHeaders).map(([k, v]) => `request.Headers.Add(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n    ');
      return `using System;
using System.Net.Http;
using System.Threading.Tasks;

class Program {
  static async Task Main() {
    var client = new HttpClient();
    var request = new HttpRequestMessage(HttpMethod.${method.toLowerCase() === 'get' ? 'Get' : method.charAt(0).toUpperCase() + method.slice(1).toLowerCase()}, ${JSON.stringify(url)});
    ${headerLines}
    ${hasBody ? `request.Content = new StringContent(${JSON.stringify(body)});` : ''}
    var resp = await client.SendAsync(request);
    var text = await resp.Content.ReadAsStringAsync();
    Console.WriteLine(text);
  }
}
`;
    }

    case 'typescript-fetch': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0) {
        if (isMultipart) {
          const formLines = enabledFormFields.map((field) => {
            const key = JSON.stringify(field.key || 'field');
            if ((field.formType || 'text') === 'file') {
              return `form.append(${key}, fileInput.files[0]);`;
            }
            const comment = field.contentType ? ` // type=${field.contentType}` : '';
            return `form.append(${key}, ${JSON.stringify(field.value || '')});${comment}`;
          }).join('\n');
          const headerLines = JSON.stringify(relevantHeaders, null, 2);
          return `const form = new FormData();
${formLines}

const url = ${JSON.stringify(url)};
const options: RequestInit = {
  method: ${JSON.stringify(method)},
  headers: ${headerLines},
  body: form,
};

const res = await fetch(url, options);
const text = await res.text();
console.log(text);
`;
        }
        const encodedBody = enabledFormFields.map((field) => `${encodeURIComponent(field.key || 'field')}=${encodeURIComponent(field.value || '')}`).join('&');
        const headerLines = JSON.stringify(relevantHeaders, null, 2);
        return `const url = ${JSON.stringify(url)};
const options: RequestInit = {
  method: ${JSON.stringify(method)},
  headers: ${headerLines},
  body: ${JSON.stringify(encodedBody)},
};

const res = await fetch(url, options);
const text = await res.text();
console.log(text);
`;
      }
      const tsHasBody = body && method !== 'GET' && method !== 'HEAD';
      const tsHeaderLines = JSON.stringify(relevantHeaders, null, 2);
      return `const url = ${JSON.stringify(url)};
const options: RequestInit = {
  method: ${JSON.stringify(method)},
  headers: ${tsHeaderLines},
${tsHasBody ? `  body: ${JSON.stringify(body)},\n` : ''}};

const res = await fetch(url, options);
const text = await res.text();
console.log(text);
`;
    }

    case 'dart': {
      const dartHeaders = objectLiteral(relevantHeaders);
      if (req.bodyType === 'form' && enabledFormFields.length > 0) {
        if (isMultipart) {
          const fieldLines = enabledFormFields.filter((field) => (field.formType || 'text') !== 'file')
            .map((field) => `request.fields[${JSON.stringify(field.key || 'field')}] = ${JSON.stringify(field.value || '')};`).join('\n  ');
          const fileLines = enabledFormFields.filter((field) => (field.formType || 'text') === 'file')
            .map((field) => `request.files.add(await http.MultipartFile.fromPath(${JSON.stringify(field.key || 'upload')}, ${JSON.stringify(field.fileName || '/path/to/file')}));`).join('\n  ');
          return `import 'package:http/http.dart' as http;

Future<void> main() async {
  final request = http.MultipartRequest(${JSON.stringify(method)}, Uri.parse(${JSON.stringify(url)}));
  request.headers.addAll(${dartHeaders});
  ${fieldLines}
  ${fileLines}
  final streamed = await request.send();
  final response = await http.Response.fromStream(streamed);
  print(response.statusCode);
  print(response.body);
}
`;
        }
        const encodedBody = enabledFormFields.map((field) => `${encodeURIComponent(field.key || 'field')}=${encodeURIComponent(field.value || '')}`).join('&');
        return `import 'package:http/http.dart' as http;

Future<void> main() async {
  final request = http.Request(${JSON.stringify(method)}, Uri.parse(${JSON.stringify(url)}));
  request.headers.addAll(${dartHeaders});
  request.body = ${JSON.stringify(encodedBody)};
  final streamed = await request.send();
  final response = await http.Response.fromStream(streamed);
  print(response.statusCode);
  print(response.body);
}
`;
      }
      const dartBody = body && method !== 'GET' && method !== 'HEAD';
      return `import 'package:http/http.dart' as http;

Future<void> main() async {
  final request = http.Request(${JSON.stringify(method)}, Uri.parse(${JSON.stringify(url)}));
  request.headers.addAll(${dartHeaders});
  ${dartBody ? `request.body = ${JSON.stringify(body)};` : ''}
  final streamed = await request.send();
  final response = await http.Response.fromStream(streamed);
  print(response.statusCode);
  print(response.body);
}
`;
    }

    case 'ruby': {
      const rubyMethodClass = `Net::HTTP::${method.charAt(0).toUpperCase() + method.slice(1).toLowerCase()}`;
      const rubyHeaders = Object.entries(relevantHeaders).map(([k, v]) => `request[${JSON.stringify(k)}] = ${JSON.stringify(v)}`).join('\n');
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        const rubyFields = enabledFormFields.map((field) => `# ${field.key || 'field'} = ${(field.formType || 'text') === 'file' ? (field.fileName || 'file') : (field.value || '')}`).join('\n');
        return `require 'uri'
require 'net/http'

uri = URI.parse("${url}")
request = ${rubyMethodClass}.new(uri)
${rubyHeaders}
# Multipart upload: use the 'httparty' or 'faraday' gem for automatic multipart support.
${rubyFields}
response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == 'https') do |http|
  http.request(request)
end
puts response.code
puts response.body
`;
      }
      const rubyBody = body && method !== 'GET' && method !== 'HEAD';
      return `require 'uri'
require 'net/http'

uri = URI.parse("${url}")
request = ${rubyMethodClass}.new(uri)
${rubyHeaders}
${rubyBody ? `request.body = ${JSON.stringify(body)}` : ''}
response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == 'https') do |http|
  http.request(request)
end
puts response.code
puts response.body
`;
    }

    case 'rust': {
      const rustMethod = method.toUpperCase();
      const rustHeaders = Object.entries(relevantHeaders).map(([k, v]) => `request = request.header(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n    ');
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        const rustFields = enabledFormFields.map((field) => `// ${field.key || 'field'} = ${(field.formType || 'text') === 'file' ? (field.fileName || 'file') : (field.value || '')}`).join('\n    ');
        return `use reqwest::blocking::Client;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let mut request = client.request(reqwest::Method::${rustMethod}, ${JSON.stringify(url)});
    ${rustHeaders}
    // Multipart upload: use reqwest::multipart::Form and client.request(...).multipart(form).
    ${rustFields}
    let response = request.send()?;
    println!("{}", response.status());
    println!("{}", response.text()?);
    Ok(())
}
`;
      }
      const rustBody = body && method !== 'GET' && method !== 'HEAD';
      return `use reqwest::blocking::Client;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let mut request = client.request(reqwest::Method::${rustMethod}, ${JSON.stringify(url)});
    ${rustHeaders}
    ${rustBody ? `request = request.body(${JSON.stringify(body)});` : ''}
    let response = request.send()?;
    println!("{}", response.status());
    println!("{}", response.text()?);
    Ok(())
}
`;
    }

    case 'kotlin-okhttp': {
      const kotlinHeaders = Object.entries(relevantHeaders).map(([k, v]) => `.addHeader(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('\n        ');
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        const kotlinParts = enabledFormFields.map((field) => {
          const key = JSON.stringify(field.key || 'field');
          if ((field.formType || 'text') === 'file') {
            return `builder.addFormDataPart(${key}, ${JSON.stringify(field.fileName || 'upload.bin')}, RequestBody.create(byteArrayOf(), MediaType.parse(${JSON.stringify(field.contentType || 'application/octet-stream')})))`;
          }
          if (field.contentType) {
            return `builder.addFormDataPart(${key}, ${JSON.stringify(field.value || '')}, RequestBody.create(${JSON.stringify(field.value || '')}.toByteArray(), MediaType.parse(${JSON.stringify(field.contentType)})))`;
          }
          return `builder.addFormDataPart(${key}, ${JSON.stringify(field.value || '')})`;
        }).join('\n        ');
        return `import okhttp3.*
import java.io.IOException

fun main() {
    val client = OkHttpClient()
    val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
    ${kotlinParts}
    val body: RequestBody = builder.build()
    val request = Request.Builder()
        .url(${JSON.stringify(url)})
        .method(${JSON.stringify(method)}, body)
        ${kotlinHeaders}
        .build()

    client.newCall(request).execute().use { response ->
        println(response.body?.string())
    }
}
`;
      }
      const kotlinHasBody = body && method !== 'GET' && method !== 'HEAD';
      const kotlinBody = kotlinHasBody
        ? `RequestBody.create(${JSON.stringify(body)}.toByteArray(), MediaType.parse(${JSON.stringify(headers['Content-Type'] || headers['content-type'] || 'text/plain')}))`
        : 'null';
      return `import okhttp3.*
import java.io.IOException

fun main() {
    val client = OkHttpClient()
    val body: RequestBody? = ${kotlinBody}
    val request = Request.Builder()
        .url(${JSON.stringify(url)})
        .method(${JSON.stringify(method)}, body)
        ${kotlinHeaders}
        .build()

    client.newCall(request).execute().use { response ->
        println(response.body?.string())
    }
}
`;
    }

    case 'httpie': {
      if (req.bodyType === 'form' && enabledFormFields.length > 0 && isMultipart) {
        const httpieFields = enabledFormFields.map((field) => {
          const key = field.key || 'field';
          if ((field.formType || 'text') === 'file') {
            return `  ${key}@${(field.fileName || 'path/to/file').replace(/"/g, '\\"')}`;
          }
          return `  ${key}=${escapeShellArg(field.value || '')}`;
        }).join(' \\\n');
        const httpieHeaderLines = Object.entries(relevantHeaders).map(([k, v]) => `  ${JSON.stringify(`${k}: ${v}`)}`).join(' \\\n');
        return `http ${method.toLowerCase()} ${JSON.stringify(url)} \\\n${httpieHeaderLines} \\\n${httpieFields}
`;
      }
      const httpieBody = body && method !== 'GET' && method !== 'HEAD';
      const httpieHeaderLines = Object.entries(relevantHeaders).map(([k, v]) => `  ${JSON.stringify(`${k}: ${v}`)}`).join(' \\\n');
      const httpieCmd = [`http ${method.toLowerCase()} ${JSON.stringify(url)}`];
      if (httpieHeaderLines) httpieCmd.push(httpieHeaderLines);
      if (httpieBody) httpieCmd.push(`  data='${String(body).replace(/'/g, "'\\''")}'`);
      return `${httpieCmd.join(' \\\n')}
`;
    }

    default:
      return '// Unsupported language';
  }
}

export default generateCode;
