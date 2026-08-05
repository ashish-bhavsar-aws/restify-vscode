import { describe, it, expect } from "vitest";
import { generateCode, SUPPORTED_LANGS } from "../../src/webview/utils/codegen";
import { RequestState, DefaultHeadersConfig } from "../../src/webview/types";

const baseRequest: RequestState = {
  name: "test",
  method: "GET",
  url: "https://api.example.com/ping",
  headers: [],
  queryParams: [],
  bodyType: "none",
  body: "",
  formData: [],
  gqlQuery: "",
  gqlVars: "",
  authType: "none",
  authData: {},
  rejectUnauthorized: false,
};

describe("generateCode with dynamic variables", () => {
  it("substitutes {{$guid}} with a UUID sample and notes it", () => {
    const code = generateCode(
      "curl",
      { ...baseRequest, headers: [{ key: "X-Id", value: "{{$guid}}" }] },
      null,
    );
    expect(code).toMatch(/X-Id: [0-9a-f-]{36}/);
    expect(code).toContain("Dynamic variables were substituted");
    expect(code).toContain("{{$guid}}");
  });

  it("substitutes {{$processEnv:NAME}} with a placeholder value", () => {
    const code = generateCode(
      "curl",
      {
        ...baseRequest,
        url: "https://api.example.com/{{$processEnv:RESTIFY_CODEGEN_ENV_UNSET_XYZ}}",
      },
      null,
    );
    expect(code).not.toContain("https://api.example.com/{{$processEnv:");
    expect(code).toContain("(value of RESTIFY_CODEGEN_ENV_UNSET_XYZ)");
    expect(code).toContain("Dynamic variables were substituted");
  });

  it("substitutes dynamic vars resolved through environment values", () => {
    const code = generateCode(
      "curl",
      { ...baseRequest, headers: [{ key: "X-Id", value: "{{dynamicId}}" }] },
      {
        id: "env",
        name: "test",
        variables: [{ key: "dynamicId", value: "{{$guid}}" }],
      },
    );
    expect(code).toMatch(/X-Id: [0-9a-f-]{36}/);
  });

  it("substitutes dynamic vars inside the body", () => {
    const code = generateCode(
      "python-requests",
      {
        ...baseRequest,
        method: "POST",
        bodyType: "json",
        body: '{"ts": "{{$timestamp}}"}',
      },
      null,
    );
    expect(code).toMatch(/\d{13}/);
    expect(code).toContain("Dynamic variables were substituted");
  });

  it("adds a comment block only when substitutions occurred", () => {
    const code = generateCode("curl", baseRequest, null);
    expect(code).not.toContain("Dynamic variables were substituted");
  });
});

describe("generateCode with default headers", () => {
  const allOn: DefaultHeadersConfig = {
    userAgent: true,
    requestId: true,
    correlationId: true,
    date: true,
  };

  it("includes enabled default headers", () => {
    const code = generateCode("curl", baseRequest, null, allOn);
    expect(code).toContain("User-Agent: Restify");
    expect(code).toMatch(/X-Request-Id: [0-9a-f-]{36}/);
    expect(code).toMatch(/X-Correlation-Id: [0-9a-f-]{36}/);
    expect(code).toMatch(/Date: [A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT/);
  });

  it("does not add default headers when none are enabled", () => {
    const code = generateCode("curl", baseRequest, null, {
      userAgent: false,
      requestId: false,
      correlationId: false,
      date: false,
    });
    expect(code).not.toContain("X-Request-Id");
    expect(code).not.toContain("User-Agent");
  });

  it("respects explicit headers over defaults", () => {
    const code = generateCode(
      "curl",
      {
        ...baseRequest,
        headers: [{ key: "User-Agent", value: "my-agent/2.0" }],
      },
      null,
      allOn,
    );
    expect(code).toContain("User-Agent: my-agent/2.0");
    expect(code).not.toMatch(/User-Agent: Restify/);
  });
});

describe("generateCode with GraphQL bodies", () => {
  const gqlRequest: RequestState = {
    ...baseRequest,
    method: "POST",
    bodyType: "graphql",
    gqlQuery: "query Me { me { id } }",
    gqlVars: '{"id": 1}',
  };

  it("serializes query + variables into the curl body", () => {
    const code = generateCode("curl", gqlRequest, null);
    expect(code).toContain("Content-Type: application/json");
    expect(code).toContain('{"query":"query Me { me { id } }","variables":{"id":1}}');
  });

  it("omits variables when gqlVars is empty", () => {
    const code = generateCode("curl", { ...gqlRequest, gqlVars: "" }, null);
    expect(code).toContain('-d \'{"query":"query Me { me { id } }"}\'');
    expect(code).not.toContain("variables");
  });

  it("sends GraphQL body in JavaScript fetch", () => {
    const code = generateCode("javascript-fetch", gqlRequest, null);
    expect(code).toContain("query Me { me { id } }");
    expect(code).toContain('\\"variables\\":{\\"id\\":1}');
    expect(code).toContain("application/json");
  });

  it("sends GraphQL body in Go via strings.NewReader", () => {
    const code = generateCode("go-http", gqlRequest, null);
    expect(code).toContain('"strings"');
    expect(code).toContain("query Me { me { id } }");
    expect(code).toContain("variables");
  });

  it("sends GraphQL body in Python requests", () => {
    const code = generateCode("python-requests", gqlRequest, null);
    expect(code).toContain('\\"query\\"');
    expect(code).toContain('\\"variables\\"');
    expect(code).toContain("application/json");
  });

  it("sends GraphQL body in C# HttpClient", () => {
    const code = generateCode("csharp-httpclient", gqlRequest, null);
    expect(code).toContain("query Me { me { id } }");
    expect(code).toContain('\\"variables\\"');
  });
});

describe("generateCode with urlencoded bodies", () => {
  const urlencodedRequest: RequestState = {
    ...baseRequest,
    method: "POST",
    bodyType: "urlencoded",
    urlencoded: [
      { key: "name", value: "Jane Doe", enabled: true },
      { key: "age", value: "30", enabled: true },
      { key: "disabled", value: "x", enabled: false },
    ],
  };

  it("serializes urlencoded fields for curl", () => {
    const code = generateCode("curl", urlencodedRequest, null);
    expect(code).toContain("Content-Type: application/x-www-form-urlencoded");
    expect(code).toContain("name=Jane%20Doe&age=30");
    expect(code).not.toContain("disabled");
  });

  it("serializes urlencoded fields for Swift", () => {
    const code = generateCode("swift-urlsession", urlencodedRequest, null);
    expect(code).toContain('request.httpBody = "name=Jane%20Doe&age=30".data(using: .utf8)');
  });

  it("serializes urlencoded fields for JavaScript fetch", () => {
    const code = generateCode("javascript-fetch", urlencodedRequest, null);
    expect(code).toContain('body: "name=Jane%20Doe&age=30",');
  });
});

describe("generateCode with text-only form bodies", () => {
  const formRequest: RequestState = {
    ...baseRequest,
    method: "POST",
    bodyType: "form",
    formData: [
      { key: "name", value: "Jane", enabled: true },
      { key: "note", value: "hello", enabled: true },
    ],
  };

  it("encodes text-only forms as urlencoded in curl (not -F)", () => {
    const code = generateCode("curl", formRequest, null);
    expect(code).not.toContain("-F ");
    expect(code).toContain("name=Jane&note=hello");
    expect(code).toContain("Content-Type: application/x-www-form-urlencoded");
  });

  it("encodes text-only forms in Go", () => {
    const code = generateCode("go-http", formRequest, null);
    expect(code).toContain('"strings"');
    expect(code).toContain('strings.NewReader("name=Jane&note=hello")');
  });

  it("encodes text-only forms in C# HttpClient", () => {
    const code = generateCode("csharp-httpclient", formRequest, null);
    expect(code).toContain('new StringContent("name=Jane&note=hello")');
  });
});

describe("generateCode request hygiene", () => {
  it("excludes disabled headers from generated code", () => {
    const code = generateCode(
      "curl",
      {
        ...baseRequest,
        method: "POST",
        bodyType: "json",
        body: '{"a":1}',
        headers: [
          { key: "X-Keep", value: "yes", enabled: true },
          { key: "X-Skip", value: "no", enabled: false },
          { key: "X-NoFlag", value: "ok" },
        ],
      },
      null,
    );
    expect(code).toContain("X-Keep: yes");
    expect(code).toContain("X-NoFlag: ok");
    expect(code).not.toContain("X-Skip");
  });

  it("excludes disabled query params from generated code", () => {
    const code = generateCode(
      "curl",
      {
        ...baseRequest,
        queryParams: [
          { key: "a", value: "1", enabled: true },
          { key: "b", value: "2", enabled: false },
        ],
      },
      null,
    );
    expect(code).toContain("?a=1");
    expect(code).not.toContain("b=2");
  });

  it("appends API key to the URL when addTo is query", () => {
    const code = generateCode(
      "curl",
      {
        ...baseRequest,
        url: "https://api.example.com/search",
        authType: "apikey",
        authData: { keyName: "api_key", keyValue: "secret123", addTo: "query" },
      },
      null,
    );
    expect(code).toContain("https://api.example.com/search?api_key=secret123");
    expect(code).not.toContain("Authorization");
  });

  it("sends API key as a header when addTo is header", () => {
    const code = generateCode(
      "curl",
      {
        ...baseRequest,
        authType: "apikey",
        authData: { keyName: "X-Key", keyValue: "abc", addTo: "header" },
      },
      null,
    );
    expect(code).toContain("X-Key: abc");
  });
});

describe("generateCode multipart edge cases", () => {
  it("generates a proper file tuple for Python multipart", () => {
    const code = generateCode(
      "python-requests",
      {
        ...baseRequest,
        method: "POST",
        bodyType: "form",
        formData: [
          { key: "upload", value: "", formType: "file", fileName: "report.csv", contentType: "text/csv", enabled: true },
          { key: "note", value: "hi", enabled: true },
        ],
      },
      null,
    );
    expect(code).toContain("report.csv");
    expect(code).toContain("open(");
    expect(code).toContain("'rb'");
  });

  it("imports io and omits strings for Go multipart", () => {
    const code = generateCode(
      "go-http",
      {
        ...baseRequest,
        method: "POST",
        bodyType: "form",
        formData: [
          { key: "upload", value: "", formType: "file", fileName: "f.bin", enabled: true },
        ],
      },
      null,
    );
    expect(code).toContain('"io"');
    expect(code).not.toContain('"strings"');
  });

  it("escapes Swift multipart filenames", () => {
    const code = generateCode(
      "swift-urlsession",
      {
        ...baseRequest,
        method: "POST",
        bodyType: "form",
        formData: [
          { key: "upload", value: "", formType: "file", fileName: 'a"b.txt', enabled: true },
        ],
      },
      null,
    );
    expect(code).toContain('filename="a\\"b.txt"');
  });
});

describe("generateCode F53 languages", () => {
  const postRequest: RequestState = {
    ...baseRequest,
    method: "POST",
    bodyType: "json",
    body: '{"name":"Ada"}',
    headers: [{ key: "X-Test", value: "yes" }],
  };

  it("generates TypeScript fetch", () => {
    const code = generateCode("typescript-fetch", postRequest, null);
    expect(code).toContain("const options: RequestInit");
    expect(code).toContain('method: "POST"');
    expect(code).toContain("X-Test");
    expect(code).toContain('body: "{\\"name\\":\\"Ada\\"}"');
    expect(code).toContain("await fetch(url, options)");
  });

  it("generates Dart http", () => {
    const code = generateCode("dart", postRequest, null);
    expect(code).toContain("package:http/http.dart");
    expect(code).toContain('http.Request("POST"');
    expect(code).toContain("request.body =");
    expect(code).toContain("X-Test");
  });

  it("generates Ruby Net::HTTP", () => {
    const code = generateCode("ruby", postRequest, null);
    expect(code).toContain("require 'net/http'");
    expect(code).toContain("Net::HTTP::Post.new(uri)");
    expect(code).toContain("request.body =");
    expect(code).toContain('request["X-Test"] = "yes"');
  });

  it("generates Rust reqwest", () => {
    const code = generateCode("rust", postRequest, null);
    expect(code).toContain("reqwest::blocking::Client");
    expect(code).toContain("reqwest::Method::POST");
    expect(code).toContain("request = request.body(");
    expect(code).toContain('request.header("X-Test", "yes")');
  });

  it("generates Kotlin OkHttp", () => {
    const code = generateCode("kotlin-okhttp", postRequest, null);
    expect(code).toContain("import okhttp3.*");
    expect(code).toContain(".url(");
    expect(code).toContain('.method("POST", body)');
    expect(code).toContain("RequestBody.create");
    expect(code).toContain('.addHeader("X-Test", "yes")');
  });

  it("generates HTTPie", () => {
    const code = generateCode("httpie", postRequest, null);
    expect(code).toContain("http post");
    expect(code).toContain('"X-Test: yes"');
    expect(code).toContain("data=");
  });

  it("handles urlencoded bodies in Dart", () => {
    const code = generateCode(
      "dart",
      {
        ...baseRequest,
        method: "POST",
        bodyType: "urlencoded",
        urlencoded: [{ key: "name", value: "Jane Doe", enabled: true }],
      },
      null,
    );
    expect(code).toContain("name=Jane%20Doe");
    expect(code).toContain("request.body =");
  });

  it("generates Kotlin multipart for file uploads", () => {
    const code = generateCode(
      "kotlin-okhttp",
      {
        ...baseRequest,
        method: "POST",
        bodyType: "form",
        formData: [{ key: "upload", value: "", formType: "file", fileName: "f.bin", enabled: true }],
      },
      null,
    );
    expect(code).toContain("MultipartBody.Builder()");
    expect(code).toContain("addFormDataPart(\"upload\"");
  });

  it("registers all F53 languages in SUPPORTED_LANGS", () => {
    const ids = [
      "typescript-fetch",
      "dart",
      "ruby",
      "rust",
      "kotlin-okhttp",
      "httpie",
    ];
    for (const id of ids) {
      expect(SUPPORTED_LANGS.some((l) => l.id === id)).toBe(true);
    }
  });
});
