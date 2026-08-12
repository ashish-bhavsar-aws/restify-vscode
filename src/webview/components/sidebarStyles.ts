import styled, { css } from 'styled-components';
import { METHOD_COLORS, STATUS_COLORS } from './sidebarTypes';

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: color-mix(in srgb, ${({ theme }) => theme.surface} 92%, transparent);
  flex-shrink: 0;
  overflow: hidden;
`;

export const SearchWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
`;

export const SearchIconWrapper = styled.div`
  position: absolute;
  left: 7px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.muted};
  pointer-events: none;
  font-size: 11px;
`;

export const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  padding: 4px 8px 4px 26px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  outline: none;
  font-family: inherit;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }

  &::placeholder {
    color: ${({ theme }) => theme.muted};
  }
`;

export const PrimaryButton = styled.button`
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  border: none;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 0 ${({ theme }) => theme.innerHighlight} inset;

  &:hover {
    opacity: 0.85;
  }
`;

export const GhostButton = styled.button`
  background: transparent;
  color: ${({ theme }) => theme.muted};
  border: 1px solid ${({ theme }) => theme.border};
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;

  &:hover {
    color: ${({ theme }) => theme.fg};
    background: ${({ theme }) => theme.hover};
  }
`;

export const IconButton = styled.button`
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

export const SaveHistoryBtn = styled(IconButton)`
  font-size: 13px;
  font-weight: 700;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

export const PinBtn = styled(IconButton)<{ $active?: boolean }>`
  color: ${({ $active, theme }) => ($active ? theme.accent : theme.muted)};
  opacity: ${({ $active }) => ($active ? 1 : 0.45)};

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
    opacity: 1;
  }
`;

export const CopyBtn = styled(IconButton)`
  opacity: 0;
  transition: opacity 0.15s;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

export const AddGroupBtn = styled(IconButton)`
  opacity: 0;
  transition: opacity 0.15s;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

export const RenameColBtn = styled(IconButton)`
  opacity: 0;
  transition: opacity 0.15s;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

export const RunBtn = styled(IconButton)`
  opacity: 0;
  transition: opacity 0.15s;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

export const RenameReqBtn = styled(IconButton)`
  opacity: 0;
  transition: opacity 0.15s;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

export const DragHandle = styled.span`
  color: ${({ theme }) => theme.muted};
  font-size: 13px;
  cursor: grab;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
  line-height: 1;
  padding: 0 1px;
  user-select: none;
  width: 14px;
  text-align: center;
`;

export const SubItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 8px;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 30%, transparent);
  cursor: pointer;
  transition: background 0.1s;

  &:hover,
  &:focus-within {
    background: ${({ theme }) => theme.hover};

    ${DragHandle} {
      opacity: 1;
    }

    ${CopyBtn} {
      opacity: 1;
    }

    ${RenameReqBtn} {
      opacity: 1;
    }
  }

  &[data-dragging] {
    opacity: 0.4;
  }
`;

export const SubName = styled.span`
  flex: 1;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const SubEmpty = styled.div`
  padding: 8px 24px;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
`;

export const ItemActions = styled.div`
  display: none;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
`;

export const ItemContent = styled.div`
  flex: 1;
  min-width: 0;
`;

export const ItemName = styled.div`
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const ItemMeta = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
`;

export const ItemRight = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
`;

export const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
`;

export const StatusDot = styled.span<{ $status: string }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $status }) => STATUS_COLORS[$status] || 'var(--error)'};
`;

export const StatusText = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
`;

export const Time = styled.span`
  font-size: 9px;
  color: ${({ theme }) => theme.muted};
`;

export const MethodBadge = styled.span<{ $method: string }>`
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
  letter-spacing: 0.5px;
  background: color-mix(in srgb, currentColor 15%, transparent);
  color: ${({ $method }) => METHOD_COLORS[$method] || 'var(--muted)'};
`;

export const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 50%, transparent);
  cursor: pointer;
  transition: background 0.1s, transform 0.1s;

  &:hover,
  &:focus-within {
    background: ${({ theme }) => theme.hover};

    ${ItemActions} {
      display: flex;
    }

    ${SaveHistoryBtn} {
      color: ${({ theme }) => theme.accent} !important;
    }
  }
`;

export const List = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.border};
    border-radius: 2px;
  }
`;

export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: ${({ theme }) => theme.muted};
  gap: 6px;
  text-align: center;
`;

export const EmptyIcon = styled.div`
  font-size: 28px;
  opacity: 0.4;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 28px;
    height: 28px;
    object-fit: contain;
    display: block;
  }
`;

export const EmptySub = styled.div`
  font-size: 10px;
  opacity: 0.6;
`;

export const EmptyCta = styled.button`
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
`;

export const Caret = styled.span<{ $open: boolean }>`
  font-size: 10px;
  transition: transform 0.2s;
  color: ${({ theme }) => theme.muted};
  display: inline-block;
  transform: ${({ $open }) => ($open ? 'rotate(90deg)' : 'none')};
`;

export const CollectionName = styled.span`
  flex: 1;
  font-weight: 600;
  font-size: 12px;
`;

export const CollectionCount = styled.span`
  color: ${({ theme }) => theme.muted};
  font-size: 10px;
`;

export const CollectionRequests = styled.div<{ $open: boolean; $isDragOver: boolean }>`
  display: ${({ $open }) => ($open ? 'block' : 'none')};
  ${({ $isDragOver, theme }) => $isDragOver && css`
    outline: 1px dashed ${theme.accent};
    background: color-mix(in srgb, ${theme.accent} 8%, transparent);
  `}
`;

export const CollectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  cursor: pointer;
  background: color-mix(in srgb, ${({ theme }) => theme.hover} 45%, transparent);
  user-select: none;
  transition: background 0.1s;

  &:hover,
  &:focus-within {
    background: ${({ theme }) => theme.hover};

    ${AddGroupBtn} {
      opacity: 1;
    }

    ${RenameColBtn} {
      opacity: 1;
    }
  }
`;

export const CollectionGroup = styled.div<{ $isDragOver: boolean }>`
  border-bottom: 1px solid ${({ theme }) => theme.border};

  ${({ $isDragOver, theme }) => $isDragOver && css`
    & > ${CollectionHeader} {
      background: color-mix(in srgb, ${theme.accent} 18%, transparent);
      outline: 1px dashed ${theme.accent};
    }
  `}
`;

export const InlineRename = styled.input`
  flex: 1;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.fg};
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  min-width: 0;
`;

export const NewGroupInline = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 20px;
`;

export const GroupFolderIcon = styled.span`
  color: ${({ theme }) => theme.muted};
  flex-shrink: 0;
  opacity: 0.8;
`;

export const GroupName = styled.span`
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.fg};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const GroupBody = styled.div``;

export const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;

  &:hover,
  &:focus-within {
    background: ${({ theme }) => theme.hover};

    ${AddGroupBtn} {
      opacity: 1;
    }

    ${RenameColBtn} {
      opacity: 1;
    }
  }
`;

export const GroupTreeWrapper = styled.div<{ $isDragOver: boolean }>`
  border-left: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 60%, transparent);
  margin-left: 12px;

  ${({ $isDragOver, theme }) => $isDragOver && css`
    & > ${GroupHeader} {
      background: color-mix(in srgb, ${theme.accent} 18%, transparent);
      outline: 1px dashed ${theme.accent};
      border-radius: 3px;
    }
  `}
`;

export const ToolbarIcons = styled.div`
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
`;

export const ToolbarExpand = styled(IconButton)`
  font-size: 14px;
  padding: 2px 3px;
  opacity: 0.7;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
    opacity: 1;
  }
`;

export const ModalOverlay = styled.div<{ $open: boolean }>`
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.overlayBg};
  z-index: 100;
  align-items: center;
  justify-content: center;
`;

export const ModalBox = styled.div`
  background: ${({ theme }) => theme.bg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 16px;
  width: 90%;
  max-width: 320px;
  box-shadow: 0 20px 48px ${({ theme }) => theme.shadowMd};

  h3 {
    font-size: 13px;
    margin-bottom: 12px;
    color: ${({ theme }) => theme.fg};
  }
`;

export const ModalLabel = styled.label`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  display: block;
  margin-bottom: 4px;
  margin-top: 8px;
`;

export const ModalInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  font-family: inherit;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

export const ModalSelect = styled.select`
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  font-family: inherit;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

export const ModalActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
`;
