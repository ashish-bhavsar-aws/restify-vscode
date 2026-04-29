import React, { useState, useEffect } from 'react';
import { Collection } from '../types';

interface SaveModalProps {
  open: boolean;
  requestName: string;
  collections: Collection[];
  onSave: (requestName: string, collectionName: string) => void;
  onClose: () => void;
}

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

  /* sync name when prop changes */
  useEffect(() => { setName(requestName); }, [requestName]);

  if (!open) return null;

  const handleSave = () => {
    const collectionName =
      selectedCollection === '__new__' ? newCollectionName.trim() : selectedCollection;
    if (!collectionName) return;
    onSave(name.trim() || 'Untitled Request', collectionName);
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Save to Collection</h3>

        <label className="modal-label">Request Name</label>
        <input
          className="modal-input"
          placeholder="My Request"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="modal-label">Collection</label>
        <select
          className="modal-input"
          value={selectedCollection}
          onChange={(e) => setSelectedCollection(e.target.value)}
        >
          <option value="__new__">+ New Collection</option>
          {collections.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        {selectedCollection === '__new__' && (
          <>
            <label className="modal-label">New Collection Name</label>
            <input
              className="modal-input"
              placeholder="My Collection"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
            />
          </>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

