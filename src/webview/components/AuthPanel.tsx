import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { RequestState, Environment, OAuth2ConfigPayload } from '../types';
import { Icon, faEye, faEyeSlash } from './FaIcon';
import {
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
import {
  InheritAuthFields,
  DigestAuthFields,
  SigV4AuthFields,
  JwtAuthFields,
  HawkAuthFields,
  NtlmAuthFields,
} from './AuthSchemeFields';

type AuthType = RequestState['authType'];

interface AuthPanelProps {
  authType: AuthType;
  authData: RequestState['authData'];
  environment?: Environment | null;
  oauthFetching?: boolean;
  oauthStatus?: { state: 'success' | 'error' | 'none'; text?: string };
  onGetOAuthToken?: (config: OAuth2ConfigPayload) => void;
  onAuthTypeChange: (type: AuthType) => void;
  onAuthDataChange: (data: Partial<RequestState['authData']>) => void;
}

/* ─── Auth Panel Styles ──────────────────────────── */

const AuthPanelWrapper = styled.div`
  padding: 12px;
`;

const OAuthStatus = styled.div<{ $state?: 'success' | 'error' }>`
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  line-height: 1.4;
  color: ${({ theme, $state }) =>
    $state === 'success' ? '#2ea043' : $state === 'error' ? '#f85149' : theme.muted};
  background: ${({ theme, $state }) =>
    $state
      ? `color-mix(in srgb, ${$state === 'success' ? '#2ea043' : '#f85149'} 10%, transparent)`
      : theme.surface2};
  border: 1px solid ${({ theme }) => theme.border};
  word-break: break-word;
`;

const OAuthGetTokenBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
  width: 100%;
  padding: 7px 12px;
  background: ${({ theme }) => theme.accent};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const OAuthSpin = styled.span`
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const OAuthTokenRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
`;

const OAuthResetBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.accent};
  font-size: 11px;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
`;

/* ─── Add-To Dropdown ────────────────────────────── */

const AddToWrap = styled.div`
  position: relative;
  width: 100%;
`;

const AddToTriggerBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  height: auto;
  background: ${({ theme }) => theme.surface2};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: ${({ theme }) => theme.fg};
  transition: border-color .15s, background .15s;
  outline: none;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.hover};
    border-color: ${({ theme }) => theme.accent};
  }
`;

const AddToTriggerLabel = styled.span`
  flex: 1;
`;

const AddToChevron = styled.svg<{ $open?: boolean }>`
  fill: ${({ theme }) => theme.muted};
  transition: transform .18s;
  flex-shrink: 0;
  margin-left: 6px;
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0)')};
`;

const AddToMenu = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  list-style: none;
  padding: 4px;
  z-index: 9999;
  box-shadow: 0 8px 24px ${({ theme }) => theme.shadowSm};
  margin: 0;
`;

const AddToOption = styled.li<{ $selected?: boolean; $highlighted?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
  transition: background .1s;
  color: ${({ $selected, theme }) => ($selected ? theme.accent : theme.fg)};
  font-weight: ${({ $selected }) => ($selected ? 600 : 400)};
  background: ${({ $selected, $highlighted, theme }) =>
    $selected
      ? `color-mix(in srgb, ${theme.accent} 12%, transparent)`
      : $highlighted
        ? theme.hover
        : 'transparent'};

  &:hover {
    background: ${({ theme }) => theme.hover};
  }
`;

const AddToOptLabel = styled.span`
  flex: 1;
`;

/* ─── Constants ──────────────────────────────────── */

const AUTH_TYPES: Array<{ value: AuthType; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'inherit', label: 'Inherit from Collection' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key' },
  { value: 'digest', label: 'Digest Auth' },
  { value: 'ntlm', label: 'NTLM Auth' },
  { value: 'awssigv4', label: 'AWS Signature v4' },
  { value: 'jwt', label: 'JWT Bearer' },
  { value: 'hawk', label: 'Hawk Auth' },
  { value: 'oauth2', label: 'OAuth 2.0' },
];

const OAUTH2_GRANT_TYPES: Array<{ value: NonNullable<RequestState['authData']['oauth2GrantType']>; label: string }> = [
  { value: 'authorization_code', label: 'Authorization Code' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'password', label: 'Password' },
];

type OAuth2GrantType = NonNullable<RequestState['authData']['oauth2GrantType']>;

/* ─── AddToDropdown ──────────────────────────────── */

const AddToDropdown: React.FC<{ value: 'header' | 'query'; onChange: (v: 'header' | 'query') => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const options = [
    { val: 'header' as const, label: 'Header' },
    { val: 'query' as const, label: 'Query Param' },
  ];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(options.findIndex((o) => o.val === value));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onChange(options[activeIndex].val);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const label = value === 'header' ? 'Header' : 'Query Param';

  return (
    <AddToWrap ref={ref}>
      <AddToTriggerBtn
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <AddToTriggerLabel>{label}</AddToTriggerLabel>
        <AddToChevron $open={open} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </AddToChevron>
      </AddToTriggerBtn>

      {open && (
        <AddToMenu role="listbox">
          {options.map((opt, idx) => (
            <AddToOption
              key={opt.val}
              role="option"
              aria-selected={opt.val === value}
              $selected={opt.val === value}
              $highlighted={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.val);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <AddToOptLabel>{opt.label}</AddToOptLabel>
            </AddToOption>
          ))}
        </AddToMenu>
      )}
    </AddToWrap>
  );
};

/* ─── AuthTypeDropdown ───────────────────────────── */

const AuthTypeDropdown: React.FC<{ authType: AuthType; onChange: (type: AuthType) => void }> = ({ authType, onChange }) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(AUTH_TYPES.findIndex((t) => t.value === authType));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, AUTH_TYPES.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onChange(AUTH_TYPES[activeIndex].value);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const label = AUTH_TYPES.find((t) => t.value === authType)?.label || 'None';

  return (
    <AuthTypeWrap ref={ref}>
      <AuthTypeTriggerBtn
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <AuthTypeTriggerLabel>{label}</AuthTypeTriggerLabel>
        <AuthTypeChevron $open={open} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </AuthTypeChevron>
      </AuthTypeTriggerBtn>

      {open && (
        <AuthTypeMenu role="listbox">
          {AUTH_TYPES.map((t, idx) => (
            <AuthTypeOption
              key={t.value}
              role="option"
              aria-selected={t.value === authType}
              $selected={t.value === authType}
              $highlighted={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(t.value);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <AuthTypeOptLabel>{t.label}</AuthTypeOptLabel>
            </AuthTypeOption>
          ))}
        </AuthTypeMenu>
      )}
    </AuthTypeWrap>
  );
};

/* ─── OAuthGrantDropdown ─────────────────────────── */

const OAuthGrantDropdown: React.FC<{ value: OAuth2GrantType; onChange: (v: OAuth2GrantType) => void }> = ({ value, onChange }) => {
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

  const label = OAUTH2_GRANT_TYPES.find((t) => t.value === value)?.label || 'Authorization Code';

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
          {OAUTH2_GRANT_TYPES.map((t) => (
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

/* ─── AuthPanel ──────────────────────────────────── */

export const AuthPanel: React.FC<AuthPanelProps> = ({ authType, authData, environment, oauthFetching, oauthStatus, onGetOAuthToken, onAuthTypeChange, onAuthDataChange }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showOauthPassword, setShowOauthPassword] = useState(false);

  const buildOAuth2Config = (): OAuth2ConfigPayload => ({
    grantType: authData.oauth2GrantType || 'authorization_code',
    authUrl: authData.oauth2AuthUrl,
    tokenUrl: authData.oauth2TokenUrl || '',
    clientId: authData.oauth2ClientId || '',
    clientSecret: authData.oauth2ClientSecret,
    scopes: authData.oauth2Scopes,
    username: authData.oauth2Username,
    password: authData.oauth2Password,
    redirectUrl: authData.oauth2RedirectUrl,
    usePkce: authData.oauth2UsePkce !== false,
    extraParams: authData.oauth2ExtraParams,
  });

  const oauthReady = !!(authData.oauth2TokenUrl && authData.oauth2ClientId);
  const oauthGrant = authData.oauth2GrantType || 'authorization_code';

  const expiryText = (expiresAt?: number): string | null => {
    if (!expiresAt) return null;
    if (Date.now() > expiresAt) return 'expired';
    const mins = Math.round((expiresAt - Date.now()) / 60000);
    if (mins < 60) return `expires in ${mins}m`;
    return `expires in ${Math.round(mins / 60)}h`;
  };
  return (
    <AuthPanelWrapper>
      <FieldLabel>Auth Type</FieldLabel>
      <AuthTypeDropdown authType={authType} onChange={onAuthTypeChange} />

      {authType === 'bearer' && (
        <AuthFieldsContainer>
          <FieldLabel style={{ marginTop: 8 }}>Token</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.token || ''}
              placeholder="your_token_here or {{variable_name}}"
              onChange={(v) => onAuthDataChange({ token: v })}
              variables={environment?.variables}
            />
          </RelativeWrap>
        </AuthFieldsContainer>
      )}

      {authType === 'basic' && (
        <AuthFieldsContainer>
          <FieldLabel style={{ marginTop: 8 }}>Username</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.username || ''}
              placeholder="username or {{variable_name}}"
              onChange={(v) => onAuthDataChange({ username: v })}
              variables={environment?.variables}
            />
          </RelativeWrap>
          <FieldLabel style={{ marginTop: 8 }}>Password</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.password || ''}
              placeholder="password or {{variable_name}}"
              onChange={(v) => onAuthDataChange({ password: v })}
              variables={environment?.variables}
              type={showPassword ? 'text' : 'password'}
            />
            <PasswordToggleBtn
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              <Icon icon={showPassword ? faEyeSlash : faEye} size={12} />
            </PasswordToggleBtn>
          </RelativeWrap>
        </AuthFieldsContainer>
      )}

      {authType === 'apikey' && (
        <AuthFieldsContainer>
          <FieldLabel>Key Name</FieldLabel>
          <AuthInput
            value={authData.keyName || ''}
            placeholder="X-API-Key or {{variable_name}}"
            onChange={(v) => onAuthDataChange({ keyName: v })}
            variables={environment?.variables}
          />
          <FieldLabel style={{ marginTop: 8 }}>Key Value</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.keyValue || ''}
              placeholder="api_key_value or {{variable_name}}"
              onChange={(v) => onAuthDataChange({ keyValue: v })}
              variables={environment?.variables}
            />
          </RelativeWrap>
          <FieldLabel style={{ marginTop: 8 }}>Add To</FieldLabel>
          <AddToDropdown value={authData.addTo || 'header'} onChange={(v) => onAuthDataChange({ addTo: v })} />
        </AuthFieldsContainer>
      )}

      {authType === 'inherit' && <InheritAuthFields onAuthDataChange={onAuthDataChange} />}

      {authType === 'digest' && (
        <DigestAuthFields authData={authData} environment={environment} onAuthDataChange={onAuthDataChange} />
      )}

      {authType === 'ntlm' && (
        <NtlmAuthFields authData={authData} environment={environment} onAuthDataChange={onAuthDataChange} />
      )}

      {authType === 'awssigv4' && (
        <SigV4AuthFields authData={authData} environment={environment} onAuthDataChange={onAuthDataChange} />
      )}

      {authType === 'jwt' && (
        <JwtAuthFields authData={authData} environment={environment} onAuthDataChange={onAuthDataChange} />
      )}

      {authType === 'hawk' && (
        <HawkAuthFields authData={authData} environment={environment} onAuthDataChange={onAuthDataChange} />
      )}

      {authType === 'oauth2' && (
        <AuthFieldsContainer>
          <OAuthHint>
            Configure the OAuth 2.0 provider and fetch an access token. The token is cached by the
            extension and refreshed automatically when possible.
          </OAuthHint>

          <FieldLabel>Grant Type</FieldLabel>
          <OAuthGrantDropdown value={oauthGrant} onChange={(v) => onAuthDataChange({ oauth2GrantType: v })} />

          {oauthGrant === 'authorization_code' && (
            <>
              <FieldLabel style={{ marginTop: 8 }}>Authorization URL</FieldLabel>
              <AuthInput
                value={authData.oauth2AuthUrl || ''}
                placeholder="https://provider.com/oauth/authorize"
                onChange={(v) => onAuthDataChange({ oauth2AuthUrl: v })}
                variables={environment?.variables}
              />
              <FieldLabel style={{ marginTop: 8 }}>Redirect URL (optional — auto-generated if empty)</FieldLabel>
              <AuthInput
                value={authData.oauth2RedirectUrl || ''}
                placeholder="http://127.0.0.1:<port>/callback"
                onChange={(v) => onAuthDataChange({ oauth2RedirectUrl: v })}
                variables={environment?.variables}
              />
              <FieldLabel style={{ marginTop: 8 }}>Use PKCE</FieldLabel>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={authData.oauth2UsePkce !== false}
                  onChange={(e) => onAuthDataChange({ oauth2UsePkce: e.target.checked })}
                />
                Send code challenge (S256)
              </label>
            </>
          )}

          <FieldLabel style={{ marginTop: 8 }}>Token URL</FieldLabel>
          <AuthInput
            value={authData.oauth2TokenUrl || ''}
            placeholder="https://provider.com/oauth/token"
            onChange={(v) => onAuthDataChange({ oauth2TokenUrl: v })}
            variables={environment?.variables}
          />

          <FieldLabel style={{ marginTop: 8 }}>Client ID</FieldLabel>
          <AuthInput
            value={authData.oauth2ClientId || ''}
            placeholder="client_id"
            onChange={(v) => onAuthDataChange({ oauth2ClientId: v })}
            variables={environment?.variables}
          />

          <FieldLabel style={{ marginTop: 8 }}>Client Secret</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.oauth2ClientSecret || ''}
              placeholder="client_secret"
              onChange={(v) => onAuthDataChange({ oauth2ClientSecret: v })}
              variables={environment?.variables}
              type={showClientSecret ? 'text' : 'password'}
            />
            <PasswordToggleBtn
              type="button"
              onClick={() => setShowClientSecret((v) => !v)}
              title={showClientSecret ? 'Hide client secret' : 'Show client secret'}
            >
              <Icon icon={showClientSecret ? faEyeSlash : faEye} size={12} />
            </PasswordToggleBtn>
          </RelativeWrap>

          <FieldLabel style={{ marginTop: 8 }}>Scopes (space separated)</FieldLabel>
          <AuthInput
            value={authData.oauth2Scopes || ''}
            placeholder="read write"
            onChange={(v) => onAuthDataChange({ oauth2Scopes: v })}
            variables={environment?.variables}
          />

          {oauthGrant === 'password' && (
            <>
              <FieldLabel style={{ marginTop: 8 }}>Username</FieldLabel>
              <AuthInput
                value={authData.oauth2Username || ''}
                placeholder="username"
                onChange={(v) => onAuthDataChange({ oauth2Username: v })}
                variables={environment?.variables}
              />
              <FieldLabel style={{ marginTop: 8 }}>Password</FieldLabel>
              <RelativeWrap>
                <AuthInput
                  value={authData.oauth2Password || ''}
                  placeholder="password"
                  onChange={(v) => onAuthDataChange({ oauth2Password: v })}
                  variables={environment?.variables}
                  type={showOauthPassword ? 'text' : 'password'}
                />
                <PasswordToggleBtn
                  type="button"
                  onClick={() => setShowOauthPassword((v) => !v)}
                  title={showOauthPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon icon={showOauthPassword ? faEyeSlash : faEye} size={12} />
                </PasswordToggleBtn>
              </RelativeWrap>
            </>
          )}

          <OAuthGetTokenBtn
            type="button"
            data-testid="oauth-get-token-btn"
            disabled={oauthFetching || !oauthReady}
            onClick={() => onGetOAuthToken?.(buildOAuth2Config())}
          >
            {oauthFetching && <OAuthSpin />}
            {oauthFetching
              ? (oauthGrant === 'authorization_code' ? 'Waiting for browser authorization…' : 'Requesting token…')
              : authData.accessToken
                ? 'Refresh Access Token'
                : 'Get New Access Token'}
          </OAuthGetTokenBtn>

          {oauthStatus?.text && (
            <OAuthStatus data-testid="oauth-status" $state={oauthStatus.state === 'success' ? 'success' : oauthStatus.state === 'error' ? 'error' : undefined}>
              {oauthStatus.text}
            </OAuthStatus>
          )}

          {authData.accessToken && (
            <OAuthTokenRow data-testid="oauth-token-row">
              <span>
                ✓ Token ready
                {expiryText(authData.tokenExpiresAt) ? ` (${expiryText(authData.tokenExpiresAt)})` : ''}
              </span>
              <OAuthResetBtn
                type="button"
                data-testid="oauth-clear-token-btn"
                onClick={() =>
                  onAuthDataChange({
                    accessToken: '',
                    refreshToken: '',
                    tokenExpiresAt: undefined,
                    tokenType: undefined,
                    tokenScope: undefined,
                  })
                }
              >
                Clear token
              </OAuthResetBtn>
            </OAuthTokenRow>
          )}
        </AuthFieldsContainer>
      )}
    </AuthPanelWrapper>
  );
};
