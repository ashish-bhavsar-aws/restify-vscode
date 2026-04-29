import React, { useRef, useState, useEffect } from 'react';
import { VariableDisplay } from './VariableDisplay';

interface VariableTextInputProps {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
  type?: string;
  variables?: Array<{ key: string; value: string }>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export const VariableTextInput: React.FC<VariableTextInputProps> = ({ value, placeholder, onChange, className = '', type = 'text', variables, onKeyDown }) => {
  const [focused, setFocused] = useState(false);
  // localValue holds the raw in-progress typed text while focused, preventing
  // derived prop updates (e.g. displayUrl recalculation) from fighting the user's input.
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync localValue from props only when the input is not focused so that
  // external state changes (e.g. loading a request from history) are reflected,
  // but mid-edit keystrokes are never overwritten by derived values.
  useEffect(() => {
    if (!focused) {
      setLocalValue(value);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`variable-text-input-wrapper ${className}`}>
      {!focused ? (
        <div
          className="variable-text-display"
          onClick={() => {
            setLocalValue(value); // sync before entering edit mode
            setFocused(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          title={value}
        >
          {value ? <VariableDisplay text={value} variables={variables} /> : <span className="placeholder">{placeholder}</span>}
        </div>
      ) : (
        <input
          ref={inputRef}
          type={type}
          className={`variable-text-input`}
          value={localValue}
          placeholder={placeholder}
          onChange={(e) => {
            setLocalValue(e.target.value);
            onChange(e.target.value);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
};

export default VariableTextInput;
