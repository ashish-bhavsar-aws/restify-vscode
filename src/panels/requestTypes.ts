export interface RequestData {
  id?: string;
  name?: string;
  method: string;
  url: string;
  headers?: Array<{ key: string; value: string; enabled?: boolean }>;
  bodyType?: string;
  body?: string;
  /** F49: encode the request body (gzip / deflate / br) before sending. */
  compressRequest?: "none" | "gzip" | "deflate" | "br";
  /** F48: send over HTTP/2 instead of HTTP/1.1. */
  useHttp2?: boolean;
  formData?: Array<{
    key: string;
    value?: string;
    enabled?: boolean;
    formType?: "text" | "file";
    fileName?: string;
    fileContentBase64?: string;
    contentType?: string;
  }>;
  urlencoded?: Array<{ key: string; value: string; enabled?: boolean }>;
  queryParams?: Array<{ key: string; value: string; enabled?: boolean }>;
  rejectUnauthorized?: boolean;
  preScript?: string;
  script?: string; // Post-response script for variable extraction
  authType?:
    | "none"
    | "bearer"
    | "basic"
    | "apikey"
    | "oauth2"
    | "digest"
    | "ntlm"
    | "awssigv4"
    | "jwt"
    | "hawk"
    | "inherit";
  authData?: {
    token?: string;
    username?: string;
    password?: string;
    keyName?: string;
    keyValue?: string;
    addTo?: "header" | "query";
    // OAuth 2.0 configuration + cached token
    oauth2GrantType?: "authorization_code" | "client_credentials" | "password";
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
    digestUsername?: string;
    digestPassword?: string;
    ntlmUsername?: string;
    ntlmPassword?: string;
    ntlmDomain?: string;
    ntlmWorkstation?: string;
    awsAccessKey?: string;
    awsSecretKey?: string;
    awsSessionToken?: string;
    awsRegion?: string;
    awsService?: string;
    jwtAlgorithm?: "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512" | "ES256" | "ES384" | "ES512";
    jwtSecret?: string;
    jwtPrivateKey?: string;
    jwtKeyId?: string;
    jwtIssuer?: string;
    jwtSubject?: string;
    jwtAudience?: string;
    jwtClaims?: string;
    jwtExpiresIn?: string;
    jwtHeaderName?: string;
    hawkId?: string;
    hawkKey?: string;
    hawkAlgorithm?: "sha256" | "sha1";
  };
  _collectionId?: string;
  gqlQuery?: string;
  gqlVars?: string;
  followRedirects?: boolean;
  timeout?: number;
  activeEnvironmentId?: string;
  soapMeta?: { isSoap12: boolean };
  /** Validate JSON responses against a JSON Schema (draft-07). */
  validateSchema?: boolean;
  schema?: string;
}
