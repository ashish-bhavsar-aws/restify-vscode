import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Environment, RequestState, DefaultHeadersConfig } from '../types';
import { generateCode, SUPPORTED_LANGS } from '../utils/codegen';
import { PrettyBodyViewer } from './PrettyBodyViewer';

interface CodeGenModalProps {
  open: boolean;
  request: RequestState;
  environment?: Environment | null;
  defaultHeaders?: DefaultHeadersConfig;
  onClose: () => void;
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
  width: min(820px, calc(100vw - 40px));
  box-shadow: 0 20px 60px ${({ theme }) => theme.overlayBg};
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const Title = styled.h3`
  font-size: 14px;
  margin-bottom: 14px;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 6px;
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

const Container = styled.div`
  display: flex;
  gap: 12px;
  height: 60vh;
  min-height: 320px;
`;

const LeftPanel = styled.div`
  width: 220px;
  background: ${({ theme }) => theme.surface2};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  flex-shrink: 0;
`;

const LangButton = styled.button<{ $selected: boolean }>`
  text-align: left;
  background: ${({ $selected, theme }) =>
    $selected ? `color-mix(in srgb, ${theme.accent} 12%, transparent)` : 'transparent'};
  border: none;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: ${({ $selected, theme }) => ($selected ? theme.accent : theme.fg)};
  font-weight: ${({ $selected }) => ($selected ? 600 : 400)};

  &:hover {
    background: ${({ $selected, theme }) =>
      $selected ? `color-mix(in srgb, ${theme.accent} 12%, transparent)` : theme.hover};
  }
`;

const RightPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;

const CodeMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.muted};
`;

const CodeBlock = styled.div`
  flex: 1;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.inputFg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  white-space: pre;
`;

const PrettyViewer = styled.div`
  height: 100%;
  width: 100%;
  min-height: 0;

  .cm-editor {
    height: 100%;
    width: 100%;
    border-radius: 6px;
  }

  .cm-scroller {
    overflow: auto;
  }
`;

export const CodeGenModal: React.FC<CodeGenModalProps> = ({ open, request, environment, defaultHeaders, onClose }) => {
  const [lang, setLang] = useState<string>(SUPPORTED_LANGS[0].id);
  const [code, setCode] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const out = generateCode(lang, request, environment, defaultHeaders);
    setCode(out);
  }, [open, lang, request, environment, defaultHeaders]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      alert('Code copied to clipboard');
    } catch {
      alert('Failed to copy');
    }
  };

  return (
    <Overlay $open={open} onClick={onClose} data-testid="codegen-overlay">
      <Modal onClick={(e) => e.stopPropagation()} data-testid="codegen-modal">
        <Header>
          <Title>Generate Code</Title>
          <Actions>
            <GhostButton onClick={onClose}>Close</GhostButton>
            <PrimaryButton onClick={handleCopy}>Copy</PrimaryButton>
          </Actions>
        </Header>

        <Container>
          <LeftPanel>
            {SUPPORTED_LANGS.map((s) => (
              <LangButton
                key={s.id}
                $selected={lang === s.id}
                onClick={() => setLang(s.id)}
                type="button"
              >
                {s.label}
              </LangButton>
            ))}
          </LeftPanel>

          <RightPanel>
            <CodeMeta>{SUPPORTED_LANGS.find((x) => x.id === lang)?.label}</CodeMeta>
            <CodeBlock tabIndex={0} role="region" aria-label="Generated code">
              <PrettyViewer>
                <PrettyBodyViewer text={code} language="text" />
              </PrettyViewer>
            </CodeBlock>
          </RightPanel>
        </Container>
      </Modal>
    </Overlay>
  );
};

export default CodeGenModal;
