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

  const getOffsetWithin = (el: HTMLElement, node: Node, offset: number) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.setEnd(node, offset);
    return range.toString().length;
  };

  const getPointOffset = (el: HTMLElement, clientX: number, clientY: number) => {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(clientX, clientY);
      if (pos && el.contains(pos.offsetNode)) {
        return getOffsetWithin(el, pos.offsetNode, pos.offset);
      }
    }

    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const range = doc.caretRangeFromPoint?.(clientX, clientY);
    if (range && el.contains(range.startContainer)) {
      return getOffsetWithin(el, range.startContainer, range.startOffset);
    }

    return value.length;
  };

  // Compute the selection inside the highlighted display so it can be preserved
  // when display mode swaps to the native input.
  const getDisplaySelectionRange = (el: HTMLElement | null, e?: React.MouseEvent<HTMLElement>) => {
    if (!el) return { start: 0, end: 0 };
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.startContainer) && el.contains(range.endContainer)) {
        const start = getOffsetWithin(el, range.startContainer, range.startOffset);
        const end = getOffsetWithin(el, range.endContainer, range.endOffset);
        return start <= end ? { start, end } : { start: end, end: start };
      }
    }

    const pos = e ? getPointOffset(el, e.clientX, e.clientY) : 0;
    return { start: pos, end: pos };
  };

  const focusInputWithSelection = (start: number, end = start) => {
    setLocalValue(value);
    setFocused(true);
    setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const length = (input.value || value).length;
      input.setSelectionRange(Math.min(start, length), Math.min(end, length));
    }, 0);
  };

  return (
    <div className={`variable-text-input-wrapper ${className}`}>
      {!focused ? (
        <div
          className="variable-text-display"
          onMouseUp={(e) => {
            if (e.button !== 0) return;
            const el = e.currentTarget as HTMLElement;
            const { start, end } = getDisplaySelectionRange(el, e);
            focusInputWithSelection(start, end);
          }}
          onPaste={(e) => {
            e.preventDefault();
            const paste = e.clipboardData?.getData('text') ?? '';
            const el = e.currentTarget as HTMLElement;
            const { start, end } = getDisplaySelectionRange(el);
            setLocalValue(value); // ensure local is synced
            setFocused(true);
            // wait for input to mount and focus, then insert
            setTimeout(() => {
              const input = inputRef.current;
              if (!input) return;
              input.focus();
              const newVal = (input.value || value).slice(0, start) + paste + (input.value || value).slice(end);
              setLocalValue(newVal);
              onChange(newVal);
              const caret = start + paste.length;
              input.setSelectionRange(caret, caret);
            }, 0);
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
