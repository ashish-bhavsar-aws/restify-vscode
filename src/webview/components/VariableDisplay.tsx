 import React, { useMemo } from 'react';
import styled from 'styled-components';

interface VariableDisplayProps {
  text: string;
  variables?: Array<{ key: string; value: string }>;
  onlyHighlight?: boolean; // If true, only render the text without any markup
}

interface ParsedPart {
  type: 'text' | 'variable';
  content: string;
  varName?: string;
  isResolved?: boolean;
  resolvedValue?: string;
}

const VariableTag = styled.span<{ $resolved?: boolean }>`
  display: inline;
  font-weight: 600;
  font-size: inherit;
  font-family: ${({ theme }) => theme.monoFamily};
  white-space: nowrap;
  padding: 0;
  color: ${({ $resolved, theme }) => ($resolved ? theme.success : theme.error)};
  background: none;
  border: none;
  ${({ $resolved, theme }) => !$resolved && `
    text-decoration: wavy underline ${theme.error};
    text-decoration-thickness: 1.5px;
    text-underline-offset: 2px;
  `}
`;

const BoldBrace = styled.span`
  font-weight: 700;
`;

/**
 * Parses text to extract variables in format {{VAR}}
 * Returns array of text and variable parts
 */
const parseVariables = (text: string): ParsedPart[] => {
  const parts: ParsedPart[] = [];
  const variableRegex = /\{\{([^}]+)}}/g;
  let lastIndex = 0;

  let match;
  while ((match = variableRegex.exec(text)) !== null) {
    // Add text before variable
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    // Add variable
    parts.push({
      type: 'variable',
      content: match[0], // Full {{VAR}}
      varName: match[1], // Just VAR
    });

    lastIndex = variableRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return parts;
};

/**
 * Finds variable value in the variables list
 */
const resolveVariable = (
  varName: string,
  variables?: Array<{ key: string; value: string }>
): string | null => {
  if (!variables) return null;
  const variable = variables.find((v) => v.key === varName);
  return variable ? variable.value : null;
};

/**
 * VariableDisplay component
 * Displays text with variable highlighting
 * - Unresolved variables shown in red with {{ and }}
 * - Resolved variables shown in green
 * - Hover shows resolved value in tooltip
 */
export const VariableDisplay: React.FC<VariableDisplayProps> = ({
  text,
  variables,
  onlyHighlight = false,
}) => {
  const parts = useMemo(() => {
    const parsed = parseVariables(text);
    return parsed.map((part) => {
      if (part.type === 'variable' && part.varName) {
        const resolved = resolveVariable(part.varName, variables);
        return {
          ...part,
          isResolved: resolved !== null,
          resolvedValue: resolved || undefined,
        };
      }
      return part;
    });
  }, [text, variables]);

  // If only highlight mode, return plain text
  if (onlyHighlight) {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return <span key={idx}>{part.content}</span>;
        }

        // Variable part
        const isResolved = part.isResolved;
        const varName = part.varName || '';

        if (isResolved) {
          return (
            <VariableTag
              key={idx}
              $resolved
              title={`${varName} = ${part.resolvedValue}`}
            >
              {part.content}
            </VariableTag>
          );
        } else {
          const openBrace = '{{';
          const closeBrace = '}}';
          return (
            <VariableTag key={idx} title={`Variable '${varName}' not found in current environment`}>
              <BoldBrace>{openBrace}</BoldBrace>
              <span>{varName}</span>
              <BoldBrace>{closeBrace}</BoldBrace>
            </VariableTag>
          );
        }
      })}
    </>
  );
};

/**
 * Hook to check if text contains unresolved variables
 */
export const useHasUnresolvedVariables = (
  text: string,
  variables?: Array<{ key: string; value: string }>
): boolean => {
  return useMemo(() => {
    const parts = parseVariables(text);
    return parts.some((part) => {
      if (part.type === 'variable' && part.varName) {
        return resolveVariable(part.varName, variables) === null;
      }
      return false;
    });
  }, [text, variables]);
};

/**
 * Utility function to get all variables used in text
 */
export const extractVariablesFromText = (text: string): string[] => {
  const parts = parseVariables(text);
  return parts
    .filter((p) => p.type === 'variable' && p.varName)
    .map((p) => p.varName || '');
};



