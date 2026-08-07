import styled from 'styled-components';
import VariableTextInput from './VariableTextInput';

export type JwtAlgorithm =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'ES256'
  | 'ES384'
  | 'ES512';

/* ─── Shared styled primitives for the auth UI ────── */

export const FieldLabel = styled.label`
  display: block;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 4px;
`;

export const AuthFieldsContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export const AuthInput = styled(VariableTextInput)`
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  font-family: monospace;
  outline: none;
  display: flex;
  align-items: stretch;
  transition: border-color .15s;

  &:focus-within {
    border-color: ${({ theme }) => theme.accent};
    background: ${({ theme }) => theme.inputBg};
    color: ${({ theme }) => theme.fg};
  }

  .variable-text-display,
  .variable-text-input {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    padding: 7px 10px;
    width: 100%;
    font-size: 12px;
    font-family: monospace;
    color: ${({ theme }) => theme.fg};
    min-width: 0;
    flex: 1;
  }

  .variable-text-display:hover {
    border: none !important;
    background: transparent !important;
  }

  .variable-text-input:focus {
    background: transparent !important;
    box-shadow: none !important;
  }
`;

export const RelativeWrap = styled.div`
  position: relative;
`;

export const PasswordToggleBtn = styled.button`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.muted};
  padding: 2px;
  line-height: 1;
`;

export const OAuthHint = styled.p`
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.5;
  color: ${({ theme }) => theme.muted};
`;

export const AuthTypeWrap = styled.div`
  position: relative;
  width: 100%;
  margin-bottom: 12px;
`;

export const AuthTypeTriggerBtn = styled.button`
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

export const AuthTypeTriggerLabel = styled.span`
  flex: 1;
`;

export const AuthTypeChevron = styled.svg<{ $open?: boolean }>`
  fill: ${({ theme }) => theme.muted};
  transition: transform .18s;
  flex-shrink: 0;
  margin-left: 6px;
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0)')};
`;

export const AuthTypeMenu = styled.ul`
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

export const AuthTypeOption = styled.li<{ $selected?: boolean; $highlighted?: boolean }>`
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

export const AuthTypeOptLabel = styled.span`
  flex: 1;
`;
