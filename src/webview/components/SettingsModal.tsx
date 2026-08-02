import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { SettingsState, CertEntry } from '../types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (settings: SettingsState) => void;
  initialSettings?: SettingsState;
}

const Overlay = styled.div<{ $open: boolean }>`
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.overlayBg};
  z-index: 200;
  align-items: center;
  justify-content: center;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.bg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  padding: 18px;
  width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px ${({ theme }) => theme.overlayBg};
`;

const Title = styled.h3`
  font-size: 14px;
  margin-bottom: 14px;
`;

const Section = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.border};
  padding-bottom: 16px;
  margin-bottom: 16px;

  &:last-of-type {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
`;

const ProxyRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 100px;
  gap: 10px;
  margin-bottom: 10px;
`;

const ProxyField = styled.div`
  display: flex;
  flex-direction: column;

  input {
    margin-bottom: 0;
  }
`;

const Label = styled.label`
  display: block;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 4px;
`;

const Input = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  outline: none;
  margin-bottom: 10px;
  font-family: inherit;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  cursor: pointer;
  font-size: 12px;
  color: ${({ theme }) => theme.fg};

  input {
    cursor: pointer;
  }
`;

const ProxyAuthSection = styled.div`
  background: color-mix(in srgb, ${({ theme }) => theme.accent} 8%, transparent);
  padding: 10px;
  border-radius: ${({ theme }) => theme.radius};
  margin-bottom: 10px;
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.accent} 25%, transparent);
`;

const HelperText = styled.p`
  display: block;
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 8px;
  opacity: 0.8;
  margin-top: -6px;
`;

const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  margin-bottom: 10px;
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
`;

const TagRemove = styled.button`
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  opacity: 0.8;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
`;

const CertList = styled.div`
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  padding: 0;
  margin-bottom: 12px;
  max-height: 300px;
  overflow-y: auto;
`;

const CertEntry_ = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.border};

  &:last-child {
    border-bottom: none;
  }
`;

const CertHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  cursor: pointer;
  transition: background 0.15s;
  background: color-mix(in srgb, ${({ theme }) => theme.accent2} 5%, transparent);

  &:hover {
    background: color-mix(in srgb, ${({ theme }) => theme.accent2} 10%, transparent);
  }
`;

const CertToggle = styled.span<{ $open: boolean }>`
  display: inline-block;
  width: 16px;
  text-align: center;
  color: ${({ theme }) => theme.muted};
  font-size: 10px;
  transition: transform 0.2s;
  transform: rotate(${({ $open }) => ($open ? '90deg' : '0deg')});
`;

const CertHostname = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.fg};
  flex: 1;
  font-size: 12px;
`;

const RemoveBtn = styled.button`
  background: transparent;
  color: ${({ theme }) => theme.fg};
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.15s;
  opacity: 0.6;

  &:hover {
    opacity: 1;
    color: ${({ theme }) => theme.accent};
  }
`;

const CertContent = styled.div`
  padding: 10px 12px;
  background: ${({ theme }) => theme.shadowSm};
  border-top: 1px solid ${({ theme }) => theme.border};

  ${Label} {
    margin-bottom: 4px;
    margin-top: 8px;

    &:first-of-type {
      margin-top: 0;
    }
  }

  ${Input} {
    margin-bottom: 8px;
  }
`;

const CertForm = styled.div`
  background: ${({ theme }) => theme.innerHighlight};
  padding: 10px;
  border-radius: 4px;

  h5 {
    margin-top: 16px;
    margin-bottom: 12px;
  }
`;

const PrimaryButton = styled.button`
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  border: none;
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
`;

const GhostButton = styled.button`
  background: transparent;
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.hover};
  }
`;

const SecondaryButton = styled.button`
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
  width: 100%;
  margin-top: 8px;

  &:hover {
    background: ${({ theme }) => theme.hover};
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: 6px;
`;

const ErrorBanner = styled.div`
  color: ${({ theme }) => theme.error};
  font-size: 11px;
  margin-top: 4px;
  padding: 4px 6px;
  background: color-mix(in srgb, ${({ theme }) => theme.error} 10%, transparent);
  border-radius: 4px;
`;

const SuccessBanner = styled.div`
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  animation: slideDown 0.2s ease-out;
  background: ${({ theme }) => theme.success};
  color: ${({ theme }) => theme.bg};
  border: 1px solid ${({ theme }) => theme.success};
`;

const ErrorBanner2 = styled.div`
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  animation: slideDown 0.2s ease-out;
  background: ${({ theme }) => theme.error};
  color: ${({ theme }) => theme.bg};
  border: 1px solid ${({ theme }) => theme.error};
`;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  onSave,
  initialSettings,
}) => {
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [useProxyAuth, setUseProxyAuth] = useState(false);
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [noProxyInput, setNoProxyInput] = useState('');
  const [noProxyTags, setNoProxyTags] = useState<string[]>([]);

  const [certificates, setCertificates] = useState<CertEntry[]>([]);
  const [expandedCert, setExpandedCert] = useState<number | null>(null);
  const [newCert, setNewCert] = useState<CertEntry>({
    hostname: '',
    certPath: '',
    keyPath: '',
    caPath: '',
  });
  const [showActivityLog, setShowActivityLog] = useState(true);
  const [defaultTimeout, setDefaultTimeout] = useState(30000);

  const [proxyError, setProxyError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (initialSettings) {
      if (initialSettings.proxy) {
        try {
          const url = new URL(initialSettings.proxy);
          setProxyHost(url.hostname || '');
          setProxyPort(url.port || '');
        } catch {
          setProxyHost(initialSettings.proxy);
        }
      } else {
        setProxyHost('');
        setProxyPort('');
        setUseProxyAuth(false);
        setProxyUsername('');
        setProxyPassword('');
      }

      if (initialSettings.proxyAuthorization) {
        setUseProxyAuth(true);
        try {
          const decoded = atob(initialSettings.proxyAuthorization);
          const [username, password] = decoded.split(':');
          setProxyUsername(username || '');
          setProxyPassword(password || '');
        } catch {
          setProxyUsername(initialSettings.proxyAuthorization);
        }
      }

      if (initialSettings.noProxy) {
        const tags = initialSettings.noProxy
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        setNoProxyTags(tags);
      } else {
        setNoProxyTags([]);
      }

      setCertificates(initialSettings.certificates || []);
      setShowActivityLog(initialSettings.showActivityLog !== false);
      setDefaultTimeout(initialSettings.defaultTimeout ?? 30000);
    }

    if (!open) {
      setMessage(null);
    }
  }, [initialSettings, open]);

  if (!open) return null;

  const buildProxyUrl = (): string => {
    if (!proxyHost) return '';
    const port = proxyPort ? `:${proxyPort}` : '';
    return `http://${proxyHost}${port}`;
  };

  const buildProxyAuth = (): string => {
    if (!useProxyAuth || !proxyUsername) return '';
    return btoa(`${proxyUsername}:${proxyPassword || ''}`);
  };

  const handleSave = () => {
    if (proxyHost) {
      if (/\s/.test(proxyHost) || /^https?:\/\//i.test(proxyHost)) {
        setProxyError('Enter hostname only (e.g. proxy.example.com), without http:// prefix or spaces.');
        return;
      }
      if (proxyPort && (isNaN(Number(proxyPort)) || Number(proxyPort) < 1 || Number(proxyPort) > 65535)) {
        setProxyError('Port must be a number between 1 and 65535.');
        return;
      }
    }
    setProxyError(null);
    onSave({
      proxy: buildProxyUrl(),
      proxyAuthorization: buildProxyAuth(),
      noProxy: noProxyTags.join(','),
      certificates,
      showActivityLog,
      defaultTimeout:
        typeof defaultTimeout === 'number' && defaultTimeout > 0
          ? defaultTimeout
          : 30000,
    });
  };

  const handleAddNoProxyTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && noProxyInput.trim()) {
      const newTag = noProxyInput.trim();
      if (!noProxyTags.includes(newTag)) {
        setNoProxyTags([...noProxyTags, newTag]);
      }
      setNoProxyInput('');
    }
  };

  const handleRemoveNoProxyTag = (index: number) => {
    setNoProxyTags(noProxyTags.filter((_, i) => i !== index));
  };

  const addCertificate = () => {
    if (
      !newCert.hostname.trim() ||
      !newCert.certPath.trim() ||
      !newCert.keyPath.trim()
    ) {
      return;
    }
    setCertificates([...certificates, { ...newCert }]);
    setNewCert({ hostname: '', certPath: '', keyPath: '', caPath: '' });
  };

  const removeCertificate = (index: number) => {
    setCertificates(certificates.filter((_, i) => i !== index));
    if (expandedCert === index) setExpandedCert(null);
  };

  const updateCertificate = (index: number, field: keyof CertEntry, value: string) => {
    const updated = [...certificates];
    updated[index] = { ...updated[index], [field]: value };
    setCertificates(updated);
  };

  return (
    <Overlay $open={open} onClick={onClose} data-testid="settings-overlay">
      <Modal onClick={(e) => e.stopPropagation()} data-testid="settings-modal">
        <Title>⚙️ Settings</Title>

        <Section>
          <h4>General</h4>
          <CheckboxLabel data-testid="activity-log-toggle">
            <input
              type="checkbox"
              checked={showActivityLog}
              onChange={(e) => setShowActivityLog(e.target.checked)}
            />
            Show Activity Log
          </CheckboxLabel>
          <HelperText>
            Enable or disable the activity log panel that records request events.
          </HelperText>

          <Label>Default Timeout (ms)</Label>
          <Input
            type="number"
            min={1}
            placeholder="30000"
            value={defaultTimeout}
            onChange={(e) => setDefaultTimeout(Number(e.target.value))}
          />
          <HelperText>
            Default timeout applied to requests that don't specify one.
          </HelperText>
        </Section>

        <Section>
          <h4>Proxy Settings (Optional)</h4>

          <ProxyRow>
            <ProxyField>
              <Label>Host</Label>
              <Input
                placeholder="proxy.example.com"
                value={proxyHost}
                onChange={(e) => { setProxyHost(e.target.value); setProxyError(null); }}
              />
            </ProxyField>
            <ProxyField>
              <Label>Port</Label>
              <Input
                type="number"
                placeholder="8080"
                value={proxyPort}
                onChange={(e) => { setProxyPort(e.target.value); setProxyError(null); }}
              />
            </ProxyField>
          </ProxyRow>
          {proxyError && <ErrorBanner>⚠️ {proxyError}</ErrorBanner>}

          <CheckboxLabel>
            <input
              type="checkbox"
              checked={useProxyAuth}
              onChange={(e) => setUseProxyAuth(e.target.checked)}
            />
            Use Proxy Authentication
          </CheckboxLabel>

          {useProxyAuth && (
            <ProxyAuthSection>
              <Label>Username</Label>
              <Input
                placeholder="username"
                value={proxyUsername}
                onChange={(e) => setProxyUsername(e.target.value)}
              />
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="password"
                value={proxyPassword}
                onChange={(e) => setProxyPassword(e.target.value)}
              />
            </ProxyAuthSection>
          )}

          <Label>No Proxy Hosts (press Enter to add)</Label>
          <HelperText>
            Exact domain match only: Add ubstest.com to bypass proxy only for ubstest.com (not subdomains)
          </HelperText>
          <Input
            placeholder="localhost"
            value={noProxyInput}
            onChange={(e) => setNoProxyInput(e.target.value)}
            onKeyDown={handleAddNoProxyTag}
          />

          {noProxyTags.length > 0 && (
            <TagsContainer>
              {noProxyTags.map((tag, idx) => (
                <Tag key={idx}>
                  {tag}
                  <TagRemove onClick={() => handleRemoveNoProxyTag(idx)} title="Remove">
                    ✕
                  </TagRemove>
                </Tag>
              ))}
            </TagsContainer>
          )}
        </Section>

        <Section>
          <h4>Client Certificates (Optional)</h4>

          {certificates.length > 0 && (
            <CertList>
              {certificates.map((cert, index) => (
                <CertEntry_ key={index}>
                  <CertHeader
                    onClick={() =>
                      setExpandedCert(expandedCert === index ? null : index)
                    }
                  >
                    <CertToggle $open={expandedCert === index}>▶</CertToggle>
                    <CertHostname>{cert.hostname}</CertHostname>
                    <RemoveBtn
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCertificate(index);
                      }}
                      title="Remove certificate"
                    >
                      ✕
                    </RemoveBtn>
                  </CertHeader>

                  {expandedCert === index && (
                    <CertContent>
                      <Label>Certificate Path</Label>
                      <Input
                        placeholder="/path/to/cert.pem"
                        value={cert.certPath}
                        onChange={(e) =>
                          updateCertificate(index, 'certPath', e.target.value)
                        }
                      />
                      <Label>Key Path</Label>
                      <Input
                        placeholder="/path/to/key.pem"
                        value={cert.keyPath}
                        onChange={(e) =>
                          updateCertificate(index, 'keyPath', e.target.value)
                        }
                      />
                      <Label>CA Path (Optional)</Label>
                      <Input
                        placeholder="/path/to/ca.pem"
                        value={cert.caPath}
                        onChange={(e) =>
                          updateCertificate(index, 'caPath', e.target.value)
                        }
                      />
                    </CertContent>
                  )}
                </CertEntry_>
              ))}
            </CertList>
          )}

          <CertForm>
            <h5>Add New Certificate</h5>
            <Label>Hostname</Label>
            <Input
              placeholder="api.example.com"
              value={newCert.hostname}
              onChange={(e) => setNewCert({ ...newCert, hostname: e.target.value })}
            />
            <Label>Certificate Path</Label>
            <Input
              placeholder="/path/to/cert.pem"
              value={newCert.certPath}
              onChange={(e) => setNewCert({ ...newCert, certPath: e.target.value })}
            />
            <Label>Key Path</Label>
            <Input
              placeholder="/path/to/key.pem"
              value={newCert.keyPath}
              onChange={(e) => setNewCert({ ...newCert, keyPath: e.target.value })}
            />
            <Label>CA Path (Optional)</Label>
            <Input
              placeholder="/path/to/ca.pem"
              value={newCert.caPath}
              onChange={(e) => setNewCert({ ...newCert, caPath: e.target.value })}
            />
            <SecondaryButton onClick={addCertificate}>+ Add Certificate</SecondaryButton>
          </CertForm>
        </Section>

        {message && (
          message.type === 'success'
            ? <SuccessBanner>{message.text}</SuccessBanner>
            : <ErrorBanner2>{message.text}</ErrorBanner2>
        )}

        <Actions>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSave}>Save Settings</PrimaryButton>
        </Actions>
      </Modal>
    </Overlay>
  );
};
