import React from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';

export interface TabItem {
  id: string;
  label: string;
  dirty: boolean;
  active: boolean;
  loading: boolean;
}

interface TabBarProps {
  tabs: TabItem[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

const Bar = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 4px 8px 0;
  background: ${({ theme }) => theme.surface};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  overflow-x: auto;
  flex-shrink: 0;
`;

const Tab = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 12px;
  border: 1px solid ${({ theme }) => theme.border};
  border-bottom: none;
  border-radius: ${({ theme }) => theme.radius} ${({ theme }) => theme.radius} 0 0;
  background: ${({ theme, $active }) => ($active ? theme.bg : theme.surface2)};
  color: ${({ theme, $active }) => ($active ? theme.fg : theme.muted)};
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  max-width: 220px;
  flex-shrink: 0;
`;

const Label = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
`;

const DirtyDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ theme }) => theme.warning};
  flex-shrink: 0;
`;

const Close = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.muted};
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  &:hover {
    background: ${({ theme }) => theme.hover};
    color: ${({ theme }) => theme.fg};
  }
`;

const Add = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.muted};
  cursor: pointer;
  padding: 5px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  &:hover {
    background: ${({ theme }) => theme.hover};
    color: ${({ theme }) => theme.fg};
  }
`;

const TabBar: React.FC<TabBarProps> = ({ tabs, onSelect, onClose, onAdd }) => (
  <Bar>
    {tabs.map((tab) => (
      <Tab
        key={tab.id}
        $active={tab.active}
        title={tab.label}
        onClick={() => onSelect(tab.id)}
      >
        {tab.dirty && <DirtyDot />}
        <Label>{tab.label}</Label>
        <Close
          title="Close tab"
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
        >
          <FontAwesomeIcon icon={faXmark} fixedWidth />
        </Close>
      </Tab>
    ))}
    <Add title="New request" onClick={onAdd}>
      <FontAwesomeIcon icon={faPlus} fixedWidth />
    </Add>
  </Bar>
);

export default TabBar;
