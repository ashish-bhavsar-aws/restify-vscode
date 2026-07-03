import { RequestState } from '../types';

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
];

function headerObj(headers: Array<{ key?: string; value?: string }>) {
  const obj: Record<string, string> = {};
  (headers || []).forEach((h) => {
    if (h.key) obj[h.key] = h.value || '';
  });
  return obj;
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

export function generateCode(lang: string, req: RequestState): string {
  const method = req.method || 'GET';
  const url = req.url || '';
  const body = req.body || '';
  const enabledFormFields = getEnabledFormFields(req);
  const isMultipart = isMultipartFormRequest(req);
  const headers = buildHeaders(req, isMultipart);
  const relevantHeaders = filterContentTypeHeader(headers, isMultipart);

  switch (lang) {
    case 'curl': {
      let cmd = `curl -X ${method}`;
      Object.entries(relevantHeaders).forEach(([k, v]) => {
        cmd += ` -H "${k}: ${v.replace(/"/g, '\\"')}"`;
      });
      if (req.bodyType === 'form' && enabledFormFields.length > 0) {
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
            return `    ${JSON.stringify(field.key || 'field')}: (${JSON.stringify(field.fileName || 'file'), JSON.stringify(field.fileName || 'file')}),${comment}`;
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
      if (req.bodyType === 'form' && enabledFormFields.length > 0) {
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
multipart.append("Content-Disposition: form-data; name=${key}; filename="${field.fileName || 'upload.bin'}"\r\n".data(using: .utf8)!)
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
            return `part, err := writer.CreatePart(textproto.MIMEHeader{"Content-Disposition": {"form-data; name=" + ${key}}, "Content-Type": {${JSON.stringify(field.contentType)}}})
  if err != nil { panic(err) }
  part.Write([]byte(${JSON.stringify(field.value || '')}))`;
          }
          return `writer.WriteField(${key}, ${JSON.stringify(field.value || '')})`;
        }).join('\n  ');
        const headerLines = Object.entries(relevantHeaders).map(([k, v]) => `req.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('\n  ');
        const imports = hasCustomTypes ? `  "net/textproto"` : '';
        return `package main

import (
  "bytes"
  "fmt"
  "mime/multipart"
  "net/http"
  "strings"${imports}
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

    default:
      return '// Unsupported language';
  }
}

export default generateCode;
