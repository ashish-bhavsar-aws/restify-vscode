import styled from 'styled-components';
import { Icon } from './FaIcon';

/* ─── Styled Components ──────────────────────────── */

export const PaneWrapper = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${({ theme }) => theme.border};
  min-width: 0;
  background: color-mix(in srgb, ${({ theme }) => theme.bg} 96%, ${({ theme }) => theme.surface} 4%);
`;

export const TabBarContainer = styled.div`
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  padding: 0 14px;
  background: color-mix(in srgb, ${({ theme }) => theme.surface} 92%, transparent);
  flex-shrink: 0;
  gap: 2px;
`;

export const TabItem = styled.div<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: all .15s;
  color: ${({ $active, theme }) => ($active ? theme.accent : theme.muted)};
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.accent : 'transparent')};
  background: ${({ $active, theme }) =>
    $active ? `color-mix(in srgb, ${theme.accent} 8%, transparent)` : 'transparent'};

  &:hover {
    color: ${({ $active, theme }) => ($active ? theme.accent : theme.fg)};
  }
`;

export const TabIcon = styled(Icon)<{ $active?: boolean }>`
  color: ${({ $active, theme }) => ($active ? theme.accent : theme.muted)};
  flex-shrink: 0;
`;

export const TabBadgeCount = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  font-size: 9px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  margin-left: 4px;
  font-weight: 700;
  vertical-align: middle;
  line-height: 1;
`;

export const TabBadgeDot = styled(TabBadgeCount)`
  width: 6px;
  height: 6px;
  min-width: 6px;
  border-radius: 50%;
  padding: 0;
`;

export const TabPanel = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  flex-direction: column;
`;

export const HeaderPresetBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
`;

export const PresetLabel = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.muted};
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

export const PresetSelect = styled.select`
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.inputFg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  padding: 5px 8px;
  font-size: 12px;
  min-width: 160px;
  flex: 1;
  max-width: 320px;
`;

export const PresetNameInput = styled.input`
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.inputFg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  padding: 5px 8px;
  font-size: 12px;
  flex: 1;
  max-width: 260px;
`;

export const PresetBtn = styled.button<{ $danger?: boolean }>`
  background: ${({ theme, $danger }) => ($danger ? 'transparent' : theme.surface2)};
  color: ${({ theme, $danger }) => ($danger ? theme.error : theme.fg)};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.hover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

export const ScrollContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;

  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.border};
    border-radius: 3px;
  }
`;

export const BodyTypeBar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
  flex-wrap: wrap;
`;

export const BodyTypeBtn = styled.button<{ $active?: boolean }>`
  background: ${({ $active, theme }) => ($active ? theme.surface2 : 'none')};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.border : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.fg : theme.muted)};
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  transition: all .15s;

  &:hover {
    color: ${({ theme }) => theme.fg};
    border-color: ${({ theme }) => theme.border};
  }
`;

export const EmptyBodyText = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
`;

export const BodyEditorWrap = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

/* ─── Form Data Section ──────────────────────────── */

export const FormWrap = styled.div`
  display: flex;
  flex-direction: column;
`;

export const FormRow = styled.div`
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  min-height: 36px;

  &:last-of-type {
    border-bottom: none;
  }
`;

export const FormCheck = styled.div`
  padding: 0 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;

  input[type='checkbox'] {
    cursor: pointer;
    accent-color: ${({ theme }) => theme.accent};
  }
`;

export const FormInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.fg};
  padding: 8px 10px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.monoFamily};
  outline: none;
  min-width: 0;
  border-right: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  transition: background-color 0.2s, color 0.2s;

  &:last-of-type {
    border-right: none;
  }

  &:focus {
    background: color-mix(in srgb, ${({ theme }) => theme.accent} 8%, ${({ theme }) => theme.inputBg});
    color: ${({ theme }) => theme.fg};
  }

  &::placeholder {
    color: ${({ theme }) => theme.muted};
  }
`;

export const FormKeyWrap = styled.div`
  display: flex;
  align-items: stretch;
  flex: 1;
  border-right: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  gap: 0;

  & ${FormInput} {
    flex: 1;
    border-right: none;
  }
`;

export const FormTypeSelect = styled.select`
  flex: 0 0 40px;
  background: ${({ theme }) => theme.surface2};
  border: none;
  color: ${({ theme }) => theme.fg};
  padding: 0 4px;
  font-size: 10px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  text-align: center;
  font-weight: 600;
  border-left: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);

  &:hover {
    background: ${({ theme }) => theme.surface};
  }

  &:focus {
    outline: none;
    background: color-mix(in srgb, ${({ theme }) => theme.accent} 15%, ${({ theme }) => theme.surface2});
    color: ${({ theme }) => theme.accent};
  }
`;

export const FormFileWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: ${({ theme }) => theme.surface2};
  border-radius: 3px;
  min-height: 28px;
  min-width: 0;
`;

export const FormFileInput = styled.input`
  flex: 1 1 0;
  font-size: 10px;
  color: ${({ theme }) => theme.inputFg};
  cursor: pointer;
  min-width: 0;
  width: 100%;

  &::file-selector-button {
    background: ${({ theme }) => theme.surface};
    color: ${({ theme }) => theme.fg};
    border: 1px solid ${({ theme }) => theme.border};
    padding: 3px 8px;
    border-radius: 2px;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
    margin-right: 4px;

    &:hover {
      background: ${({ theme }) => theme.hover};
    }
  }
`;

export const FormFileName = styled.span<{ $hasFile?: boolean }>`
  max-width: 160px;
  font-size: 10px;
  color: ${({ $hasFile, theme }) => ($hasFile ? theme.success : theme.muted)};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  padding: 0 4px;
`;

export const FormDelBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.muted};
  padding: 4px 8px;
  font-size: 15px;
  flex-shrink: 0;
  transition: color .1s;
  display: flex;
  align-items: center;

  &:hover {
    color: ${({ theme }) => theme.error};
  }
`;

export const FormAddBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.accent};
  cursor: pointer;
  font-size: 11px;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  transition: opacity .15s;

  &:hover {
    opacity: .8;
  }
`;

/* ─── Content-Type Sub-Row ───────────────────────── */

export const CtypeRow = styled.div`
  display: flex;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding-left: 24px;
  align-items: center;
`;

export const CtypeLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  flex-shrink: 0;
`;

export const CtypeBadge = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.accent};
  font-family: monospace;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, ${({ theme }) => theme.accent} 10%, transparent);
`;

export const CtypeUseBtn = styled.button`
  padding: 2px 8px;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  background-color: ${({ theme }) => theme.accent};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.accentFg};
`;

export const CtypeClearBtn = styled.button`
  padding: 2px 8px;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  background-color: transparent;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.muted};
`;

export const CtypeFileRow = styled.div`
  display: flex;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding-left: 24px;
`;

/* ─── GraphQL Section ────────────────────────────── */

export const GqlLabel = styled.div<{ $hasBorderTop?: boolean }>`
  padding: 6px 10px;
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  ${({ $hasBorderTop, theme }) =>
    $hasBorderTop && `border-top: 1px solid ${theme.border};`}
`;

export const CodeTextarea = styled.textarea`
  flex: 1;
  background: ${({ theme }) => theme.inputBg};
  border: none;
  color: ${({ theme }) => theme.inputFg};
  padding: 10px 14px;
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  resize: none;
  outline: none;
  line-height: 1.6;
  tab-size: 2;
`;

/* ─── SOAP / WSDL Section ─────────────────────────── */

export const SoapMetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
`;

export const SoapMetaLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  flex-shrink: 0;
`;

export const SoapMetaSelect = styled.select`
  flex: 1;
  min-width: 0;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.inputFg};
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-family: inherit;
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

/* ─── Script Tab ─────────────────────────────────── */

export const ScriptTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
`;

export const ScriptDesc = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 6px;
`;

export const Mono = styled.span`
  font-family: monospace;
`;

export const SchemaTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
`;

export const SchemaDesc = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 6px;
`;

export const SchemaToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;

  input[type="checkbox"] {
    accent-color: ${({ theme }) => theme.accent};
  }
`;
