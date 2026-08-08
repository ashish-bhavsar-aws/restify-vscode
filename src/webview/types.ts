export interface KVItem {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface FormDataItem extends KVItem {
  formType?: 'text' | 'file';
  fileName?: string;
  fileContentBase64?: string;
  contentType?: string;
}

export interface SoapOperationMeta {
  name: string;
  soapAction: string;
  location?: string;
  isSoap12: boolean;
  body: string;
}

export interface SoapRequestMeta {
  wsdl: string;
  operation: string;
  targetNamespace: string;
  isSoap12: boolean;
  operations: SoapOperationMeta[];
}

export interface RequestState {
  name: string;
  method: string;
  url: string;
  headers: KVItem[];
  queryParams: KVItem[];
  bodyType: 'none' | 'json' | 'text' | 'xml' | 'form' | 'urlencoded' | 'graphql';
  body: string;
  bodyFormat?: 'formatted' | 'minified';
  formData: FormDataItem[];
  gqlQuery: string;
  gqlVars: string;
  authType:
    | 'none'
    | 'bearer'
    | 'basic'
    | 'apikey'
    | 'oauth2'
    | 'digest'
    | 'awssigv4'
    | 'jwt'
    | 'hawk'
    | 'inherit';
  authData: {
    token?: string;
    username?: string;
    password?: string;
    keyName?: string;
    keyValue?: string;
    addTo?: 'header' | 'query';
    // OAuth 2.0 configuration + cached token
    oauth2GrantType?: 'authorization_code' | 'client_credentials' | 'password';
    oauth2AuthUrl?: string;
    oauth2TokenUrl?: string;
    oauth2ClientId?: string;
    oauth2ClientSecret?: string;
    oauth2Scopes?: string;
    oauth2Username?: string;
    oauth2Password?: string;
    oauth2RedirectUrl?: string;
    oauth2UsePkce?: boolean;
    oauth2ExtraParams?: Record<string, string>;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    tokenType?: string;
    tokenScope?: string;
    // Digest Auth
    digestUsername?: string;
    digestPassword?: string;
    // AWS SigV4
    awsAccessKey?: string;
    awsSecretKey?: string;
    awsSessionToken?: string;
    awsRegion?: string;
    awsService?: string;
    // JWT bearer
    jwtAlgorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
    jwtSecret?: string;
    jwtPrivateKey?: string;
    jwtKeyId?: string;
    jwtIssuer?: string;
    jwtSubject?: string;
    jwtAudience?: string;
    jwtClaims?: string;
    jwtExpiresIn?: string;
    jwtHeaderName?: string;
    // Hawk
    hawkId?: string;
    hawkKey?: string;
    hawkAlgorithm?: 'sha256' | 'sha1';
  };
  /** Which collection this request was loaded from, for "inherit" auth. */
  _collectionId?: string;
  rejectUnauthorized: boolean;
  followRedirects?: boolean;
  timeout?: number; // per-request timeout in ms; falls back to settings default
  preScript?: string; // JavaScript to run before the request is sent
  script?: string; // JavaScript to extract variables from response
  urlencoded?: KVItem[]; // URL-encoded form parameters (application/x-www-form-urlencoded)
  soapMeta?: SoapRequestMeta;
  /** Validate JSON responses against a JSON Schema (draft-07). */
  validateSchema?: boolean;
  /** The JSON Schema (draft-07) text the response body is validated against. */
  schema?: string;
}

export interface ResponseState {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: string;
  duration: number;
  size: number;
  isFileResponse?: boolean;
  fileDetectionSource?: 'mime' | 'filename';
  fileName?: string;
  fileMimeType?: string;
  fileBase64?: string;
  filePreviewType?: 'text' | 'csv' | 'pdf' | 'excel' | 'none';
}

export interface EnvVariable extends KVItem {
  timestamp?: number;
  isSecret?: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvVariable[];
}

export interface CollectionGroup {
  id: string;
  name: string;
  requests?: any[];
  groups?: CollectionGroup[];
}

export interface Collection {
  id: string;
  name: string;
  requests?: any[];
  groups?: CollectionGroup[];
}

export const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export const getStatusClass = (status: number): string => {
  if (status >= 200 && status < 300) return 'status-2xx';
  if (status >= 300 && status < 400) return 'status-3xx';
  if (status >= 400 && status < 500) return 'status-4xx';
  if (status >= 500) return 'status-5xx';
  return '';
};

export interface CertEntry {
  hostname: string;
  certPath: string;
  keyPath: string;
  caPath: string;
}

/** Global WS-Security defaults stored in settings (Settings → SOAP Security),
 *  keyed by hostname exactly like the SSL client-certificate entries.
 *
 *  Mirrors the SoapUI WS-Security model: outgoing actions (UsernameToken,
 *  body encryption) and incoming actions (response decryption) are independent
 *  and combinable — not mutually exclusive "types". */
export interface SoapSecurityEntry {
  hostname: string;   // '*' for all hosts, or exact host / subdomain match
  username: string;
  password: string;
  /** Outgoing: inject a WS-Security UsernameToken. */
  useUsername?: boolean;
  /** Outgoing: XML-encrypt the request body. */
  encrypt?: boolean;
  /** Incoming: decrypt an encrypted response body. */
  decrypt?: boolean;
  /** Truststore: recipient certificate (PEM) — public key source for encryption. */
  certPath?: string;
  /** Keystore: private key file (PEM) for response decryption. */
  keyPath?: string;
  /** Keystore: PKCS#12 (.p12/.pfx) bundle with cert + private key. */
  p12Path?: string;
  p12Password?: string;
  /** For decryption: where the keystore private key comes from. */
  keystore?: 'p12' | 'pem';
}

export interface DefaultHeadersConfig {
  userAgent: boolean;
  requestId: boolean;
  correlationId: boolean;
  date: boolean;
  /** Arbitrary header name/value pairs injected into every request unless the
   *  same header is set explicitly (case-insensitive). */
  custom?: KVItem[];
}

export interface SettingsState {
  proxy: string;
  proxyAuthorization: string;
  noProxy: string;          // comma-separated
  certificates: CertEntry[];
  showActivityLog: boolean;
  defaultTimeout: number;   // default request timeout in ms
  defaultHeaders: DefaultHeadersConfig;
  soapSecurity: SoapSecurityEntry[]; // global WS-Security defaults by hostname
}

export interface OAuth2ConfigPayload {
  grantType: 'authorization_code' | 'client_credentials' | 'password';
  authUrl?: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string;
  username?: string;
  password?: string;
  redirectUrl?: string;
  usePkce?: boolean;
  extraParams?: Record<string, string>;
}

export const DEFAULT_SETTINGS: SettingsState = {
  proxy: '',
  proxyAuthorization: '',
  noProxy: '',
  certificates: [],
  showActivityLog: true,
  defaultTimeout: 30000,
  defaultHeaders: {
    userAgent: false,
    requestId: false,
    correlationId: false,
    date: false,
    custom: [],
  },
  soapSecurity: [],
};

export const DEFAULT_REQUEST: RequestState = {
  name: 'New Request',
  method: 'GET',
  url: '',
  headers: [],
  queryParams: [],
  bodyType: 'none',
  body: '',
  bodyFormat: 'formatted',
  formData: [],
  gqlQuery: '',
  gqlVars: '',
  authType: 'none',
  authData: {},
  rejectUnauthorized: true,
  followRedirects: true,
  preScript: '',
  script: '',
  urlencoded: [],
  validateSchema: false,
  schema: '',
};
