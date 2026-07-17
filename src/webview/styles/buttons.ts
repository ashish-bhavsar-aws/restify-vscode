import styled from 'styled-components';

export const Btn = styled.button`
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

export const BtnGhost = styled.button`
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

export const BtnSecondary = styled.button`
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

export const BtnRemove = styled.button`
  background: transparent;
  color: ${({ theme }) => theme.fg};
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.15s;
  &:hover {
    color: ${({ theme }) => theme.accent};
  }
`;

export const BtnIcon = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.muted};
  cursor: pointer;
  padding: 2px 5px;
  font-size: 14px;
  border-radius: 3px;
  flex-shrink: 0;
  transition: color 0.1s;
  line-height: 1;
  &:hover {
    color: ${({ theme }) => theme.error};
  }
`;

export const BtnIconSm = styled.button<{ $danger?: boolean }>`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.muted};
  cursor: pointer;
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.15s;
  flex-shrink: 0;
  line-height: 1;
  &:hover {
    background: ${({ theme }) => theme.hover};
    color: ${({ $danger, theme }) => ($danger ? theme.error : theme.fg)};
  }
`;
