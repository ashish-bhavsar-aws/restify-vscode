import React from 'react';
import styled from 'styled-components';
import { DYNAMIC_VARIABLES } from '../../core/dynamicVarTokens';

interface VariablesHelpModalProps {
  open: boolean;
  onClose: () => void;
}

const Overlay = styled.div<{ $open: boolean }>`
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.overlayBg};
  z-index: 210;
  align-items: center;
  justify-content: center;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.bg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  padding: 18px;
  width: min(620px, calc(100vw - 40px));
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px ${({ theme }) => theme.overlayBg};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
`;

const Title = styled.h3`
  font-size: 14px;
  margin: 0;
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.muted};
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  transition: color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.fg};
  }
`;

const Intro = styled.p`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin: 0 0 12px;
  line-height: 1.5;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 150px 1fr 180px;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  align-items: baseline;
  font-size: 12px;

  &:last-of-type {
    border-bottom: none;
  }
`;

const Token = styled.code`
  font-family: ${({ theme }) => theme.monoFamily};
  font-weight: 600;
  color: ${({ theme }) => theme.info};
  background: color-mix(in srgb, ${({ theme }) => theme.info} 10%, transparent);
  border-radius: 4px;
  padding: 2px 5px;
`;

const Desc = styled.span`
  color: ${({ theme }) => theme.fg};
`;

const Example = styled.code`
  font-family: ${({ theme }) => theme.monoFamily};
  color: ${({ theme }) => theme.success};
  background: ${({ theme }) => theme.inputBg};
  border-radius: 4px;
  padding: 2px 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Note = styled.p`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin: 12px 0 0;
  line-height: 1.5;

  strong {
    color: ${({ theme }) => theme.info};
    font-family: ${({ theme }) => theme.monoFamily};
    font-weight: 600;
  }
`;

export const VariablesHelpModal: React.FC<VariablesHelpModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <Overlay $open={open} onClick={onClose} data-testid="vars-help-overlay">
      <Modal onClick={(e) => e.stopPropagation()} data-testid="vars-help-modal">
        <Header>
          <Title>Dynamic Variables</Title>
          <CloseBtn onClick={onClose} data-testid="vars-help-close" title="Close">✕</CloseBtn>
        </Header>

        <Intro>
          Dynamic variables are resolved on the host right before each request is sent,
          so every request gets a fresh value. Use them anywhere <strong>environment</strong>{' '}
          variables work: URL, params, headers, body, and auth fields.
        </Intro>

        {DYNAMIC_VARIABLES.map((v) => (
          <Row key={v.name}>
            <Token>{v.label}</Token>
            <Desc>{v.description}</Desc>
            <Example>{v.example}</Example>
          </Row>
        ))}

        <Title style={{ margin: '14px 0 8px', fontSize: 13 }}>Request chaining</Title>
        <Intro>
          Post-response scripts can extract values from a response and store them as
          variables scoped to this window. Reference them in later requests with{' '}
          <strong>{'{{varName}}'}</strong> — chain across unlimited requests in the
          same window. A new window starts a fresh scope.
        </Intro>
        <Row>
          <Token>{'{{token}}'}</Token>
          <Desc>Value stored by a post-response script (e.g. <strong>{'set(\'token\', response.body.access_token)'}</strong>)</Desc>
          <Example>{'Authorization: Bearer {{token}}'}</Example>
        </Row>

        <Note>
          Tip: type <strong>{'{{$'}</strong> in the URL or a header value to autocomplete.
          Environment variables use the <strong>{'{{envVar}}'}</strong> syntax and come from
          your active environment. Hover a variable token to preview its resolved value.
        </Note>
      </Modal>
    </Overlay>
  );
};

export default VariablesHelpModal;
