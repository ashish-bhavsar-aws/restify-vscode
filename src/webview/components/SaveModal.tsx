import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
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

const Select = styled.select`
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
      <Modal onClick={(e) => e.stopPropagation()}>
        <Title>Save to Collection</Title>

        <Label>Request Name</Label>
        <Input
          placeholder="My Request"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Label>Collection</Label>
        <Select
          value={selectedCollection}
          onChange={(e) => setSelectedCollection(e.target.value)}
        >
          <option value="__new__">+ New Collection</option>
          {collections.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>

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
            <Select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="__none__">— Root (no folder) —</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
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
