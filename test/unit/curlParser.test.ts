import { describe, it, expect } from 'vitest';
import { parseCurl } from '../../src/core/curlParser';

describe('parseCurl', () => {
  it('parses a simple GET request', () => {
    const r = parseCurl('curl https://api.example.com/users');
    expect(r.method).toBe('GET');
    expect(r.url).toBe('https://api.example.com/users');
    expect(r.headers).toEqual([]);
    expect(r.bodyType).toBe('none');
  });

  it('parses -X POST with JSON body', () => {
    const r = parseCurl(`curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d '{"name":"John"}'`);
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://api.example.com/users');
    expect(r.headers).toHaveLength(1);
    expect(r.headers[0]).toEqual({ key: 'Content-Type', value: 'application/json', enabled: true });
    expect(r.body).toBe('{"name":"John"}');
    expect(r.bodyType).toBe('json');
  });

  it('parses multiple headers', () => {
    const r = parseCurl(`curl -H "Accept: application/json" -H "X-Custom: foo" https://api.example.com`);
    expect(r.headers).toHaveLength(2);
    expect(r.headers[0].key).toBe('Accept');
    expect(r.headers[1].key).toBe('X-Custom');
  });

  it('parses --data-raw', () => {
    const r = parseCurl(`curl --data-raw 'hello' https://api.example.com`);
    expect(r.method).toBe('POST');
    expect(r.body).toBe('hello');
    expect(r.bodyType).toBe('text');
  });

  it('parses basic auth with -u', () => {
    const r = parseCurl(`curl -u admin:secret123 https://api.example.com`);
    expect(r.authType).toBe('basic');
    expect(r.authData.username).toBe('admin');
    expect(r.authData.password).toBe('secret123');
  });

  it('parses Bearer token from Authorization header', () => {
    const r = parseCurl(`curl -H "Authorization: Bearer mytoken123" https://api.example.com`);
    expect(r.authType).toBe('bearer');
    expect(r.authData.token).toBe('mytoken123');
    expect(r.headers.find(h => h.key === 'Authorization')).toBeUndefined();
  });

  it('parses -k / --insecure flag', () => {
    const r = parseCurl(`curl -k https://self-signed.example.com`);
    expect(r.rejectUnauthorized).toBe(false);
  });

  it('parses form data with -F', () => {
    const r = parseCurl(`curl -F "file=@/path/to/file.pdf" -F "name=test" https://api.example.com/upload`);
    expect(r.method).toBe('POST');
    expect(r.bodyType).toBe('form');
    expect(r.formData).toHaveLength(2);
    expect(r.formData[0]).toEqual({ key: 'file', value: '/path/to/file.pdf', enabled: true, formType: 'file', fileName: 'file.pdf' });
    expect(r.formData[1]).toEqual({ key: 'name', value: 'test', enabled: true, formType: 'text', fileName: undefined });
  });

  it('parses --data-urlencode', () => {
    const r = parseCurl(`curl --data-urlencode "search=hello world" https://api.example.com`);
    expect(r.urlencoded).toHaveLength(1);
    expect(r.urlencoded[0]).toEqual({ key: 'search', value: 'hello world', enabled: true });
  });

  it('parses multi-line command', () => {
    const r = parseCurl(`curl -X PUT \\
      -H "Content-Type: application/json" \\
      -d '{"updated":true}' \\
      https://api.example.com/users/1`);
    expect(r.method).toBe('PUT');
    expect(r.body).toBe('{"updated":true}');
    expect(r.bodyType).toBe('json');
    expect(r.url).toBe('https://api.example.com/users/1');
  });

  it('parses -I / --head as HEAD method', () => {
    const r = parseCurl(`curl -I https://api.example.com`);
    expect(r.method).toBe('HEAD');
  });

  it('parses single-quoted strings', () => {
    const r = parseCurl(`curl -H 'Content-Type: text/plain' 'https://api.example.com/path'`);
    expect(r.headers[0].key).toBe('Content-Type');
    expect(r.headers[0].value).toBe('text/plain');
    expect(r.url).toBe('https://api.example.com/path');
  });

  it('parses oauth2-bearer', () => {
    const r = parseCurl(`curl --oauth2-bearer tok_xxx https://api.example.com`);
    expect(r.authType).toBe('bearer');
    expect(r.authData.token).toBe('tok_xxx');
  });

  it('auto-detects XML body', () => {
    const r = parseCurl(`curl -d '<root><item/></root>' https://api.example.com`);
    expect(r.bodyType).toBe('xml');
  });

  it('handles empty input gracefully', () => {
    const r = parseCurl('');
    expect(r.method).toBe('GET');
    expect(r.url).toBe('');
  });

  it('parses cookie with -b', () => {
    const r = parseCurl(`curl -b "session=abc123" https://api.example.com`);
    expect(r.headers).toHaveLength(1);
    expect(r.headers[0].key).toBe('Cookie');
    expect(r.headers[0].value).toBe('session=abc123');
  });

  it('parses User-Agent with -A', () => {
    const r = parseCurl(`curl -A "MyAgent/1.0" https://api.example.com`);
    expect(r.headers).toHaveLength(1);
    expect(r.headers[0].key).toBe('User-Agent');
    expect(r.headers[0].value).toBe('MyAgent/1.0');
  });
});
