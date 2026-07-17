import React, { useRef, useState, useEffect } from 'react';
import styled from 'styled-components';
import { VariableDisplay } from './VariableDisplay';

interface VariableTextInputProps {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
  type?: string;
  variables?: Array<{ key: string; value: string }>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

const Wrapper = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: stretch;
`;

const Display = styled.div`
  flex: 1;
  min-width: 0;
  cursor: text;
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  font-family: ${({ theme }) => theme.monoFamily};
  color: ${({ theme }) => theme.fg};
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;

  .placeholder {
    color: ${({ theme }) => theme.muted};
  }

  &:hover {
    background: ${({ theme }) => theme.hover};
    border-color: color-mix(in srgb, ${({ theme }) => theme.accent} 50%, ${({ theme }) => theme.border});
  }
`;

const Input = styled.input`
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  font-family: ${({ theme }) => theme.monoFamily};
  color: ${({ theme }) => theme.inputFg};
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.accent};
  outline: none;
  line-height: 1.5;

  &:focus {
    background: ${({ theme }) => theme.inputBg};
    color: ${({ theme }) => theme.inputFg};
    border-color: ${({ theme }) => theme.accent};
    box-shadow: 0 0 0 2px color-mix(in srgb, ${({ theme }) => theme.accent} 20%, transparent);
  }
`;

export const VariableTextInput: React.FC<VariableTextInputProps> = ({ value, placeholder, onChange, className = '', type = 'text', variables, onKeyDown, onFocus, onBlur }) => {
  const [focused, setFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    <Wrapper className={className}>
      {!focused ? (
        <Display
          data-testid="variable-text-display"
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
            setLocalValue(value);
            setFocused(true);
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
        </Display>
      ) : (
        <Input
          ref={inputRef}
          data-testid="variable-text-input"
          type={type}
          value={localValue}
          placeholder={placeholder}
          onChange={(e) => {
            setLocalValue(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          onKeyDown={onKeyDown}
        />
      )}
    </Wrapper>
  );
};

export default VariableTextInput;
