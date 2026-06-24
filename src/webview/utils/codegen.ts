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

export function generateCode(lang: string, req: RequestState): string {
  const method = req.method || 'GET';
  const url = req.url || '';
  const headers = headerObj(req.headers || []);
  const body = req.body || '';

  switch (lang) {
    case 'curl': {
      let cmd = `curl -X ${method}`;
      Object.entries(headers).forEach(([k, v]) => {
        cmd += ` -H "${k}: ${v.replace(/"/g, '\\"')}"`;
      });
      if (body && method !== 'GET' && method !== 'HEAD') {
        const escaped = String(body).replace(/'/g, "'\\''");
        cmd += ` -d '${escaped}'`;
      }
      cmd += ` "${url}"`;
      return cmd;
    }

    case 'javascript-fetch': {
      const headerLines = JSON.stringify(headers, null, 2);
      const bodyLine = body && method !== 'GET' && method !== 'HEAD' ? `  body: ${JSON.stringify(body)},\n` : '';
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
      const headerLines = JSON.stringify(headers, null, 2);
      const bodyPart = body && method !== 'GET' && method !== 'HEAD' ? `data: ${JSON.stringify(body)},` : '';
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
      const headerLines = JSON.stringify(headers, null, 2);
      const bodyLine = body && method !== 'GET' && method !== 'HEAD' ? `  body: ${JSON.stringify(body)},\n` : '';
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
      const headerLines = JSON.stringify(headers, null, 2);
      const hasBody = body && method !== 'GET' && method !== 'HEAD';
      return `import requests

url = ${JSON.stringify(url)}
headers = ${headerLines}

resp = requests.request(${JSON.stringify(method)}, url, headers=headers${hasBody ? `, data=${JSON.stringify(body)}` : ''})
print(resp.status_code)
print(resp.text)
`;
    }

    case 'java-okhttp': {
      const bodyPart = body && method !== 'GET' && method !== 'HEAD' ? `RequestBody.create(${JSON.stringify(body)}, okhttp3.MediaType.parse(${JSON.stringify(headers['Content-Type'] || 'text/plain')}))` : 'null';
      return `import okhttp3.*;
import java.io.IOException;

OkHttpClient client = new OkHttpClient();

RequestBody body = ${bodyPart};
Request request = new Request.Builder()
  .url(${JSON.stringify(url)})
  .method(${JSON.stringify(method)}, body)
  .headers(new Headers.Builder()${Object.entries(headers).map(([k,v]) => `.add(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('')} .build())
  .build();

try (Response response = client.newCall(request).execute()) {
  System.out.println(response.body().string());
}
`;
    }

    case 'swift-urlsession': {
      const headerLines = Object.entries(headers).map(([k, v]) => `request.setValue(${JSON.stringify(v)}, forHTTPHeaderField: ${JSON.stringify(k)})`).join('\n  ');
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
      const headerLines = Object.entries(headers).map(([k, v]) => `req.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('\n  ');
      const bodyLine = body && method !== 'GET' && method !== 'HEAD' ? `body := strings.NewReader(${JSON.stringify(body)})` : '';
      return `package main

import (
  "fmt"
  "io/ioutil"
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
  b, _ := ioutil.ReadAll(resp.Body)
  fmt.Println(string(b))
}
`;
    }

    case 'powershell': {
      const hasBody = body && method !== 'GET' && method !== 'HEAD';
      const psHeaderLiteral = '@{' + Object.entries(headers).map(([k, v]) => `${JSON.stringify(k)}=${JSON.stringify(v)}`).join('; ') + '}';
      return `$url = ${JSON.stringify(url)}
$headers = ${psHeaderLiteral}
${hasBody ? `$body = ${JSON.stringify(body)}
Invoke-RestMethod -Method ${method} -Uri $url -Headers $headers -Body $body` : `Invoke-RestMethod -Method ${method} -Uri $url -Headers $headers`}
`;
    }

    case 'php-curl': {
      const hasBody = body && method !== 'GET' && method !== 'HEAD';
      return `<?php
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, ${JSON.stringify(url)});
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${JSON.stringify(method)});
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  ${Object.entries(headers).map(([k,v]) => JSON.stringify(k + ': ' + v)).join(',\n  ')}
]);
${hasBody ? `curl_setopt($ch, CURLOPT_POSTFIELDS, ${JSON.stringify(body)});` : ''}
$resp = curl_exec($ch);
curl_close($ch);
echo $resp;
?>
`;
    }

    case 'csharp-httpclient': {
      const headerLines = Object.entries(headers).map(([k, v]) => `client.DefaultRequestHeaders.Add(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n  ');
      const hasBody = body && method !== 'GET' && method !== 'HEAD';
      return `using System;
using System.Net.Http;
using System.Threading.Tasks;

class Program {
  static async Task Main() {
    var client = new HttpClient();
    ${headerLines}
    var request = new HttpRequestMessage(HttpMethod.${method.toLowerCase() === 'get' ? 'Get' : method.charAt(0).toUpperCase() + method.slice(1).toLowerCase()}, ${JSON.stringify(url)});
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
