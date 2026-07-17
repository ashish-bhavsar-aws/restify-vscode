import styled from 'styled-components';

export const ModalOverlay = styled.div<{ $open: boolean }>`
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.overlayBg};
  z-index: 200;
  align-items: center;
  justify-content: center;
`;

export const Modal = styled.div<{ $large?: boolean; $width?: string; $maxHeight?: string }>`
  background: var(--vscode-editor-background, #1e1e2e);
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 18px;
  width: ${({ $large, $width }) =>
    $width ??
    ($large ? 'min(820px, calc(100vw - 40px))' : '340px')};
  ${({ $maxHeight }) => $maxHeight && `max-height: ${$maxHeight}; overflow-y: auto;`};
  box-shadow: 0 20px 60px ${({ theme }) => theme.overlayBg};

  h3 {
    font-size: 14px;
    margin-bottom: 14px;
  }
`;

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;

  h3 {
    margin: 0;
    font-size: 14px;
  }
`;

export const ModalCloseBtn = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.muted};
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s;
  &:hover {
    color: ${({ theme }) => theme.fg};
  }
`;

export const ModalLabel = styled.label`
  display: block;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 4px;
`;

export const ModalInput = styled.input`
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

export const ModalActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 6px;
`;
