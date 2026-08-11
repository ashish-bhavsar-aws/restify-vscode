import React, { useState, useRef, useEffect } from 'react';
import { RequestState, Environment } from '../types';
import { Icon, faEye, faEyeSlash } from './FaIcon';
import {
  JwtAlgorithm,
  FieldLabel,
  AuthFieldsContainer,
  AuthInput,
  RelativeWrap,
  PasswordToggleBtn,
  OAuthHint,
  AuthTypeWrap,
  AuthTypeTriggerBtn,
  AuthTypeTriggerLabel,
  AuthTypeChevron,
  AuthTypeMenu,
  AuthTypeOption,
  AuthTypeOptLabel,
} from './authStyles';

interface SchemeFieldsProps {
  authData: RequestState['authData'];
  environment?: Environment | null;
  onAuthDataChange: (data: Partial<RequestState['authData']>) => void;
}

const JWT_ALGORITHMS: Array<{ value: JwtAlgorithm; label: string }> = [
  { value: 'HS256', label: 'HS256 (HMAC-SHA256)' },
  { value: 'HS384', label: 'HS384 (HMAC-SHA384)' },
  { value: 'HS512', label: 'HS512 (HMAC-SHA512)' },
  { value: 'RS256', label: 'RS256 (RSA-SHA256)' },
  { value: 'RS384', label: 'RS384 (RSA-SHA384)' },
  { value: 'RS512', label: 'RS512 (RSA-SHA512)' },
  { value: 'ES256', label: 'ES256 (ECDSA-SHA256)' },
  { value: 'ES384', label: 'ES384 (ECDSA-SHA384)' },
  { value: 'ES512', label: 'ES512 (ECDSA-SHA512)' },
];

const HAWK_ALGORITHMS: Array<{ value: 'sha256' | 'sha1'; label: string }> = [
  { value: 'sha256', label: 'SHA-256' },
  { value: 'sha1', label: 'SHA-1' },
];

const SimpleAuthDropdown: React.FC<{ options: Array<{ value: string; label: string }>; value: string; onChange: (v: any) => void }> = ({
  options,
  value,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = options.find((t) => t.value === value)?.label || value;

  return (
    <AuthTypeWrap ref={ref} style={{ marginBottom: 4 }}>
      <AuthTypeTriggerBtn type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <AuthTypeTriggerLabel>{label}</AuthTypeTriggerLabel>
        <AuthTypeChevron $open={open} viewBox="0 0 10 6" width="10" height="6">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </AuthTypeChevron>
      </AuthTypeTriggerBtn>
      {open && (
        <AuthTypeMenu role="listbox">
          {options.map((t) => (
            <AuthTypeOption
              key={t.value}
              role="option"
              aria-selected={t.value === value}
              $selected={t.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(t.value);
                setOpen(false);
              }}
            >
              <AuthTypeOptLabel>{t.label}</AuthTypeOptLabel>
            </AuthTypeOption>
          ))}
        </AuthTypeMenu>
      )}
    </AuthTypeWrap>
  );
};

export const JwtAlgorithmDropdown: React.FC<{ value: JwtAlgorithm; onChange: (v: JwtAlgorithm) => void }> = ({ value, onChange }) => (
  <SimpleAuthDropdown options={JWT_ALGORITHMS} value={value} onChange={onChange} />
);

export const HawkAlgorithmDropdown: React.FC<{ value: 'sha256' | 'sha1'; onChange: (v: 'sha256' | 'sha1') => void }> = ({ value, onChange }) => (
  <SimpleAuthDropdown options={HAWK_ALGORITHMS} value={value} onChange={onChange} />
);

/* ─── Shared password field with its own visibility toggle ─── */

const PasswordField: React.FC<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  variables?: Environment['variables'];
}> = ({ label, placeholder, value, onChange, variables }) => {
  const [show, setShow] = useState(false);
  return (
    <>
      <FieldLabel style={{ marginTop: 8 }}>{label}</FieldLabel>
      <RelativeWrap>
        <AuthInput
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          variables={variables}
          type={show ? 'text' : 'password'}
        />
        <PasswordToggleBtn
          type="button"
          onClick={() => setShow((v) => !v)}
          title={show ? 'Hide password' : 'Show password'}
        >
          <Icon icon={show ? faEyeSlash : faEye} size={12} />
        </PasswordToggleBtn>
      </RelativeWrap>
    </>
  );
};

/* ─── Scheme-specific field panels ────────────────── */

export const InheritAuthFields: React.FC<Pick<SchemeFieldsProps, 'onAuthDataChange'>> = () => (
  <AuthFieldsContainer>
    <OAuthHint>
      Use the authentication configured on the parent collection. Set it from
      the collection&apos;s context menu in the sidebar (&quot;Set Auth…&quot;). Requests
      outside a collection fall back to no auth.
    </OAuthHint>
  </AuthFieldsContainer>
);

export const DigestAuthFields: React.FC<SchemeFieldsProps> = ({ authData, environment, onAuthDataChange }) => (
  <AuthFieldsContainer>
    <FieldLabel style={{ marginTop: 8 }}>Username</FieldLabel>
    <AuthInput
      value={authData.digestUsername || ''}
      placeholder="username or {{variable_name}}"
      onChange={(v) => onAuthDataChange({ digestUsername: v })}
      variables={environment?.variables}
    />
    <PasswordField
      label="Password"
      placeholder="password or {{variable_name}}"
      value={authData.digestPassword || ''}
      onChange={(v) => onAuthDataChange({ digestPassword: v })}
      variables={environment?.variables}
    />
  </AuthFieldsContainer>
);

export const SigV4AuthFields: React.FC<SchemeFieldsProps> = ({ authData, environment, onAuthDataChange }) => (
  <AuthFieldsContainer>
    <OAuthHint>
      AWS Signature Version 4. The Authorization header is computed at request
      time from the final URL, body, and headers.
    </OAuthHint>
    <FieldLabel style={{ marginTop: 8 }}>Access Key ID</FieldLabel>
    <AuthInput
      value={authData.awsAccessKey || ''}
      placeholder="AKIA… or {{variable_name}}"
      onChange={(v) => onAuthDataChange({ awsAccessKey: v })}
      variables={environment?.variables}
    />
    <PasswordField
      label="Secret Access Key"
      placeholder="secret or {{variable_name}}"
      value={authData.awsSecretKey || ''}
      onChange={(v) => onAuthDataChange({ awsSecretKey: v })}
      variables={environment?.variables}
    />
    <FieldLabel style={{ marginTop: 8 }}>Session Token (optional)</FieldLabel>
    <AuthInput
      value={authData.awsSessionToken || ''}
      placeholder="STS session token or {{variable_name}}"
      onChange={(v) => onAuthDataChange({ awsSessionToken: v })}
      variables={environment?.variables}
    />
    <FieldLabel style={{ marginTop: 8 }}>Region</FieldLabel>
    <AuthInput
      value={authData.awsRegion || ''}
      placeholder="us-east-1 or {{variable_name}}"
      onChange={(v) => onAuthDataChange({ awsRegion: v })}
      variables={environment?.variables}
    />
    <FieldLabel style={{ marginTop: 8 }}>Service</FieldLabel>
    <AuthInput
      value={authData.awsService || ''}
      placeholder="execute-api, s3, lambda, …"
      onChange={(v) => onAuthDataChange({ awsService: v })}
      variables={environment?.variables}
    />
  </AuthFieldsContainer>
);

export const JwtAuthFields: React.FC<SchemeFieldsProps> = ({ authData, environment, onAuthDataChange }) => {
  const alg = (authData.jwtAlgorithm || 'HS256') as JwtAlgorithm;
  const isHs = alg.startsWith('HS');
  return (
    <AuthFieldsContainer>
      <OAuthHint>
        Sign a JWT at request time. HS* uses a shared secret; RS*/ES* uses a PEM
        private key. The token is set as a Bearer header.
      </OAuthHint>
      <FieldLabel style={{ marginTop: 8 }}>Algorithm</FieldLabel>
      <JwtAlgorithmDropdown value={alg} onChange={(v) => onAuthDataChange({ jwtAlgorithm: v })} />
      {isHs ? (
        <PasswordField
          label="Secret"
          placeholder="shared secret or {{variable_name}}"
          value={authData.jwtSecret || ''}
          onChange={(v) => onAuthDataChange({ jwtSecret: v })}
          variables={environment?.variables}
        />
      ) : (
        <>
          <FieldLabel style={{ marginTop: 8 }}>Private Key (PEM)</FieldLabel>
          <AuthInput
            value={authData.jwtPrivateKey || ''}
            placeholder="-----BEGIN PRIVATE KEY-----… or {{variable_name}}"
            onChange={(v) => onAuthDataChange({ jwtPrivateKey: v })}
            variables={environment?.variables}
          />
        </>
      )}
      <FieldLabel style={{ marginTop: 8 }}>Key ID (kid, optional)</FieldLabel>
      <AuthInput
        value={authData.jwtKeyId || ''}
        placeholder="key-1"
        onChange={(v) => onAuthDataChange({ jwtKeyId: v })}
        variables={environment?.variables}
      />
      <FieldLabel style={{ marginTop: 8 }}>Issuer (iss)</FieldLabel>
      <AuthInput
        value={authData.jwtIssuer || ''}
        placeholder="https://issuer.example.com"
        onChange={(v) => onAuthDataChange({ jwtIssuer: v })}
        variables={environment?.variables}
      />
      <FieldLabel style={{ marginTop: 8 }}>Subject (sub)</FieldLabel>
      <AuthInput
        value={authData.jwtSubject || ''}
        placeholder="subject"
        onChange={(v) => onAuthDataChange({ jwtSubject: v })}
        variables={environment?.variables}
      />
      <FieldLabel style={{ marginTop: 8 }}>Audience (aud)</FieldLabel>
      <AuthInput
        value={authData.jwtAudience || ''}
        placeholder="audience"
        onChange={(v) => onAuthDataChange({ jwtAudience: v })}
        variables={environment?.variables}
      />
      <FieldLabel style={{ marginTop: 8 }}>Expires In</FieldLabel>
      <AuthInput
        value={authData.jwtExpiresIn || ''}
        placeholder="3600, 1h, 30m"
        onChange={(v) => onAuthDataChange({ jwtExpiresIn: v })}
        variables={environment?.variables}
      />
      <FieldLabel style={{ marginTop: 8 }}>Extra Claims (JSON, optional)</FieldLabel>
      <AuthInput
        value={authData.jwtClaims || ''}
        placeholder='{"role":"admin"}'
        onChange={(v) => onAuthDataChange({ jwtClaims: v })}
        variables={environment?.variables}
      />
      <FieldLabel style={{ marginTop: 8 }}>Header Name (optional)</FieldLabel>
      <AuthInput
        value={authData.jwtHeaderName || ''}
        placeholder="Authorization"
        onChange={(v) => onAuthDataChange({ jwtHeaderName: v })}
        variables={environment?.variables}
      />
    </AuthFieldsContainer>
  );
};

export const HawkAuthFields: React.FC<SchemeFieldsProps> = ({ authData, environment, onAuthDataChange }) => (
  <AuthFieldsContainer>
    <OAuthHint>
      Hawk MAC authentication. The Authorization header is computed at request
      time using the shared key.
    </OAuthHint>
    <FieldLabel style={{ marginTop: 8 }}>Access ID (id)</FieldLabel>
    <AuthInput
      value={authData.hawkId || ''}
      placeholder="dh37fgj492je or {{variable_name}}"
      onChange={(v) => onAuthDataChange({ hawkId: v })}
      variables={environment?.variables}
    />
    <PasswordField
      label="Key"
      placeholder="shared key or {{variable_name}}"
      value={authData.hawkKey || ''}
      onChange={(v) => onAuthDataChange({ hawkKey: v })}
      variables={environment?.variables}
    />
    <FieldLabel style={{ marginTop: 8 }}>Algorithm</FieldLabel>
    <HawkAlgorithmDropdown
      value={authData.hawkAlgorithm || 'sha256'}
      onChange={(v) => onAuthDataChange({ hawkAlgorithm: v })}
    />
  </AuthFieldsContainer>
);

export const NtlmAuthFields: React.FC<SchemeFieldsProps> = ({ authData, environment, onAuthDataChange }) => (
  <AuthFieldsContainer>
    <OAuthHint>
      NTLM challenge-response authentication (IIS / SharePoint / SMB gateways).
      The extension performs the 3-step negotiate handshake automatically.
    </OAuthHint>
    <FieldLabel style={{ marginTop: 8 }}>Username</FieldLabel>
    <AuthInput
      value={authData.ntlmUsername || ''}
      placeholder="DOMAIN\\user or {{variable_name}}"
      onChange={(v) => onAuthDataChange({ ntlmUsername: v })}
      variables={environment?.variables}
    />
    <PasswordField
      label="Password"
      placeholder="password or {{variable_name}}"
      value={authData.ntlmPassword || ''}
      onChange={(v) => onAuthDataChange({ ntlmPassword: v })}
      variables={environment?.variables}
    />
    <FieldLabel style={{ marginTop: 8 }}>Domain (optional)</FieldLabel>
    <AuthInput
      value={authData.ntlmDomain || ''}
      placeholder="CORP or {{variable_name}}"
      onChange={(v) => onAuthDataChange({ ntlmDomain: v })}
      variables={environment?.variables}
    />
    <FieldLabel style={{ marginTop: 8 }}>Workstation (optional)</FieldLabel>
    <AuthInput
      value={authData.ntlmWorkstation || ''}
      placeholder="hostname or {{variable_name}}"
      onChange={(v) => onAuthDataChange({ ntlmWorkstation: v })}
      variables={environment?.variables}
    />
  </AuthFieldsContainer>
);
