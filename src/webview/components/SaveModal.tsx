import React, { useState, useEffect, useRef } from 'react';
import styled, { css } from 'styled-components';
import { Collection, CollectionGroup } from '../types';

interface SaveModalProps {
  open: boolean;
  requestName: string;
  collections: Collection[];
  onSave: (requestName: string, collectionName: string, groupId?: string) => void;
  onClose: () => void;
}

function flattenGroups(groups: CollectionGroup[], prefix = ''): Array<{ id: string; label: string }> {
  const result: Array<{ id: string; label: string }> = [];
  for (const g of groups) {
    result.push({ id: g.id, label: `${prefix}${g.name}` });
    if (g.groups?.length) {
      result.push(...flattenGroups(g.groups, `${prefix}\u00a0\u00a0`));
    }
  }
  return result;
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
  width: 340px;
  box-shadow: 0 20px 60px ${({ theme }) => theme.overlayBg};
`;

const Title = styled.h3`
  font-size: 14px;
  margin-bottom: 14px;
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

const DropdownWrapper = styled.div`
  position: relative;
  width: 100%;
  margin-bottom: 10px;
`;

const DropdownTrigger = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 28px;
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  color: ${({ theme }) => theme.fg};
  transition: border-color 0.15s, background 0.15s;
  outline: none;

  &:hover {
    background: ${({ theme }) => theme.hover};
    border-color: ${({ theme }) => theme.accent};
  }

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const DropdownTriggerLabel = styled.span`
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DropdownChevron = styled.svg<{ $open: boolean }>`
  fill: ${({ theme }) => theme.muted};
  transition: transform 0.18s;
  flex-shrink: 0;
  ${({ $open }) => $open && css`
    transform: rotate(180deg);
  `}
`;

const DropdownMenu = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  min-width: 160px;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  list-style: none;
  padding: 4px;
  z-index: 9999;
  box-shadow: 0 12px 32px ${({ theme }) => theme.shadowSm};
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
`;

const DropdownOption = styled.li<{ $selected: boolean; $highlighted: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: ${({ theme }) => theme.fg};
  transition: background 0.1s;
  user-select: none;

  ${({ $highlighted, theme }) => $highlighted && css`
    background: ${theme.hover};
  `}

  ${({ $selected, theme }) => $selected && css`
    background: color-mix(in srgb, ${theme.accent} 12%, transparent);
    color: ${theme.accent};
    font-weight: 600;
  `}
`;

const DropdownOptionLabel = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

interface CustomDropdownProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ value, options, onChange }) => {
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

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
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
      onChange(options[activeIndex].value);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const selectedLabel = options.find((o) => o.value === value)?.label || value;

  return (
    <DropdownWrapper ref={ref}>
      <DropdownTrigger
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <DropdownTriggerLabel>{selectedLabel}</DropdownTriggerLabel>
        <DropdownChevron $open={open} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </DropdownChevron>
      </DropdownTrigger>

      {open && (
        <DropdownMenu role="listbox">
          {options.map((opt, idx) => (
            <DropdownOption
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              $selected={opt.value === value}
              $highlighted={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <DropdownOptionLabel>{opt.label}</DropdownOptionLabel>
            </DropdownOption>
          ))}
        </DropdownMenu>
      )}
    </DropdownWrapper>
  );
};

export const SaveModal: React.FC<SaveModalProps> = ({
  open,
  requestName,
  collections,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(requestName);
  const [selectedCollection, setSelectedCollection] = useState('__new__');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('__none__');

  useEffect(() => { setName(requestName); }, [requestName]);
  useEffect(() => { setSelectedGroup('__none__'); }, [selectedCollection]);

  if (!open) return null;

  const activeColl = collections.find((c) => c.name === selectedCollection);
  const availableGroups = activeColl ? flattenGroups(activeColl.groups || []) : [];

  const handleSave = () => {
    const collectionName =
      selectedCollection === '__new__' ? newCollectionName.trim() : selectedCollection;
    if (!collectionName) return;
    const groupId = selectedGroup !== '__none__' ? selectedGroup : undefined;
    onSave(name.trim() || 'Untitled Request', collectionName, groupId);
  };

  return (
    <Overlay $open={open} onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()} data-testid="save-modal">
        <Title>Save to Collection</Title>

        <Label>Request Name</Label>
        <Input
          placeholder="My Request"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Label>Collection</Label>
        <CustomDropdown
          value={selectedCollection}
          options={[
            { value: '__new__', label: '+ New Collection' },
            ...collections.map((c) => ({ value: c.name, label: c.name })),
          ]}
          onChange={setSelectedCollection}
        />

        {selectedCollection === '__new__' && (
          <>
            <Label>New Collection Name</Label>
            <Input
              placeholder="My Collection"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
            />
          </>
        )}

        {availableGroups.length > 0 && (
          <>
            <Label>Folder (optional)</Label>
            <CustomDropdown
              value={selectedGroup}
              options={[
                { value: '__none__', label: '— Root (no folder) —' },
                ...availableGroups.map((g) => ({ value: g.id, label: g.label })),
              ]}
              onChange={setSelectedGroup}
            />
          </>
        )}

        <Actions>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSave}>Save</PrimaryButton>
        </Actions>
      </Modal>
    </Overlay>
  );
};
