import React, { useState, useEffect } from 'react';
import { SettingsState, CertEntry } from '../types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (settings: SettingsState) => void;
  initialSettings?: SettingsState;
  onClearProxyCache?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  onSave,
  initialSettings,
  onClearProxyCache,
}) => {
  // Proxy settings
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [useProxyAuth, setUseProxyAuth] = useState(false);
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [noProxyInput, setNoProxyInput] = useState('');
  const [noProxyTags, setNoProxyTags] = useState<string[]>([]);

  // Certificate settings
  const [certificates, setCertificates] = useState<CertEntry[]>([]);
  const [expandedCert, setExpandedCert] = useState<number | null>(null);
  const [newCert, setNewCert] = useState<CertEntry>({
    hostname: '',
    certPath: '',
    keyPath: '',
    caPath: '',
  });

  // Message state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (initialSettings) {
      // Parse proxy URL
      if (initialSettings.proxy) {
        try {
          const url = new URL(initialSettings.proxy);
          setProxyHost(url.hostname || '');
          setProxyPort(url.port || '');
        } catch {
          setProxyHost(initialSettings.proxy);
        }
      } else {
        // Clear proxy fields if no proxy configured
        setProxyHost('');
        setProxyPort('');
        setUseProxyAuth(false);
        setProxyUsername('');
        setProxyPassword('');
      }

      // Parse proxy auth
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

      // Parse no proxy tags
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
    }
    
    // Clear message when modal closes
    if (!open) {
      setMessage(null);
    }
  }, [initialSettings, open]);

  if (!open) return null;

  // Build proxy URL from components
  const buildProxyUrl = (): string => {
    if (!proxyHost) return '';
    const port = proxyPort ? `:${proxyPort}` : '';
    return `http://${proxyHost}${port}`;
  };

  // Build proxy auth from components
  const buildProxyAuth = (): string => {
    if (!useProxyAuth || !proxyUsername) return '';
    return btoa(`${proxyUsername}:${proxyPassword || ''}`);
  };

  const handleSave = () => {
    onSave({
      proxy: buildProxyUrl(),
      proxyAuthorization: buildProxyAuth(),
      noProxy: noProxyTags.join(','),
      certificates,
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
    setNewCert({
      hostname: '',
      certPath: '',
      keyPath: '',
      caPath: '',
    });
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
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ Settings</h3>

        {/* Proxy Settings */}
        <div className="settings-section">
          <h4>Proxy Settings (Optional)</h4>

          {/* Host and Port */}
          <div className="proxy-row">
            <div className="proxy-field">
              <label className="modal-label">Host</label>
              <input
                className="modal-input"
                placeholder="proxy.example.com"
                value={proxyHost}
                onChange={(e) => setProxyHost(e.target.value)}
              />
            </div>
            <div className="proxy-field">
              <label className="modal-label">Port</label>
              <input
                className="modal-input"
                type="number"
                placeholder="8080"
                value={proxyPort}
                onChange={(e) => setProxyPort(e.target.value)}
              />
            </div>
          </div>

          {/* Proxy Authentication Checkbox */}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useProxyAuth}
              onChange={(e) => setUseProxyAuth(e.target.checked)}
            />
            Use Proxy Authentication
          </label>

          {/* Username and Password - shown when auth is enabled */}
          {useProxyAuth && (
            <div className="proxy-auth-section">
              <label className="modal-label">Username</label>
              <input
                className="modal-input"
                placeholder="username"
                value={proxyUsername}
                onChange={(e) => setProxyUsername(e.target.value)}
              />

              <label className="modal-label">Password</label>
              <input
                className="modal-input"
                type="password"
                placeholder="password"
                value={proxyPassword}
                onChange={(e) => setProxyPassword(e.target.value)}
              />
            </div>
          )}

          {/* No Proxy Tags */}
          <label className="modal-label">No Proxy Hosts (press Enter to add)</label>
          <p className="helper-text">
            Exact domain match only: Add ubstest.com to bypass proxy only for ubstest.com (not subdomains)
          </p>
          <input
            className="modal-input"
            placeholder="localhost"
            value={noProxyInput}
            onChange={(e) => setNoProxyInput(e.target.value)}
            onKeyDown={handleAddNoProxyTag}
          />
          
          {noProxyTags.length > 0 && (
            <div className="tags-container">
              {noProxyTags.map((tag, idx) => (
                <span key={idx} className="tag">
                  {tag}
                  <button
                    className="tag-remove"
                    onClick={() => handleRemoveNoProxyTag(idx)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Certificates Settings */}
        <div className="settings-section">
          <h4>Client Certificates (Optional)</h4>

          {certificates.length > 0 && (
            <div className="cert-list">
              {certificates.map((cert, index) => (
                <div key={index} className="cert-entry">
                  {/* Collapsible Header */}
                  <div
                    className="cert-header"
                    onClick={() =>
                      setExpandedCert(expandedCert === index ? null : index)
                    }
                  >
                    <span className={`cert-toggle ${expandedCert === index ? 'open' : ''}`}>
                      ▶
                    </span>
                    <span className="cert-hostname">{cert.hostname}</span>
                    <button
                      className="btn-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCertificate(index);
                      }}
                      title="Remove certificate"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Collapsible Content */}
                  {expandedCert === index && (
                    <div className="cert-content">
                      <label className="modal-label">Certificate Path</label>
                      <input
                        className="modal-input"
                        placeholder="/path/to/cert.pem"
                        value={cert.certPath}
                        onChange={(e) =>
                          updateCertificate(index, 'certPath', e.target.value)
                        }
                      />

                      <label className="modal-label">Key Path</label>
                      <input
                        className="modal-input"
                        placeholder="/path/to/key.pem"
                        value={cert.keyPath}
                        onChange={(e) =>
                          updateCertificate(index, 'keyPath', e.target.value)
                        }
                      />

                      <label className="modal-label">CA Path (Optional)</label>
                      <input
                        className="modal-input"
                        placeholder="/path/to/ca.pem"
                        value={cert.caPath}
                        onChange={(e) =>
                          updateCertificate(index, 'caPath', e.target.value)
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add New Certificate Form */}
          <div className="cert-form">
            <h5 style={{ marginTop: '16px', marginBottom: '12px' }}>Add New Certificate</h5>
            <label className="modal-label">Hostname</label>
            <input
              className="modal-input"
              placeholder="api.example.com"
              value={newCert.hostname}
              onChange={(e) =>
                setNewCert({ ...newCert, hostname: e.target.value })
              }
            />

            <label className="modal-label">Certificate Path</label>
            <input
              className="modal-input"
              placeholder="/path/to/cert.pem"
              value={newCert.certPath}
              onChange={(e) =>
                setNewCert({ ...newCert, certPath: e.target.value })
              }
            />

            <label className="modal-label">Key Path</label>
            <input
              className="modal-input"
              placeholder="/path/to/key.pem"
              value={newCert.keyPath}
              onChange={(e) =>
                setNewCert({ ...newCert, keyPath: e.target.value })
              }
            />

            <label className="modal-label">CA Path (Optional)</label>
            <input
              className="modal-input"
              placeholder="/path/to/ca.pem"
              value={newCert.caPath}
              onChange={(e) =>
                setNewCert({ ...newCert, caPath: e.target.value })
              }
            />

            <button className="btn-secondary" onClick={addCertificate}>
              + Add Certificate
            </button>
          </div>
        </div>

        {message && (
          <div
            style={{
              padding: '10px 12px',
              marginBottom: '12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              animation: 'slideDown 0.2s ease-out',
              background: message.type === 'success' ? '#a6e3a1' : '#f38ba8',
              color: message.type === 'success' ? '#1e1e2e' : '#1e1e2e',
              border: `1px solid ${message.type === 'success' ? '#a6e3a1' : '#f38ba8'}`,
            }}
          >
            {message.text}
          </div>
        )}

        <div className="modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            {onClearProxyCache && (
              <button
                className="btn-danger"
                onClick={() => {
                  if (confirm('Clear all proxy settings? This will ensure no proxy is used for future requests.')) {
                    try {
                      onClearProxyCache();
                      // Reset proxy fields immediately
                      setProxyHost('');
                      setProxyPort('');
                      setUseProxyAuth(false);
                      setProxyUsername('');
                      setProxyPassword('');
                      setNoProxyTags([]);
                      // Show success message
                      setMessage({ type: 'success', text: '✓ Proxy cache cleared successfully!' });
                      // Auto-dismiss message after 3 seconds
                      setTimeout(() => setMessage(null), 3000);
                    } catch (error) {
                      setMessage({ type: 'error', text: '✗ Failed to clear proxy cache' });
                      setTimeout(() => setMessage(null), 3000);
                    }
                  }
                }}
                title="Clear all cached proxy configuration"
                style={{
                  background: '#f38ba8',
                  color: '#1e1e2e',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f17a97';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f38ba8';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                🧹 Clear Proxy Cache
              </button>
            )}
          </div>
          <button className="btn" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

