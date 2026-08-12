import React from "react";
import styled from "styled-components";
import { RequestState } from "../types";

/**
 * F49 — per-request body compression control shown in the Body tab.
 * Encodes the request body (gzip / deflate / brotli) before it is sent.
 */
interface BodyCompressBarProps {
  request: RequestState;
  onUpdate: (updates: Partial<RequestState>) => void;
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
`;

const Label = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  white-space: nowrap;
`;

const Select = styled.select`
  padding: 3px 8px;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.inputFg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  outline: none;
  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const Hint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.info};
  white-space: nowrap;
`;

export function BodyCompressBar({
  request,
  onUpdate,
}: BodyCompressBarProps): React.ReactElement {
  const value = request.compressRequest || "none";
  return (
    <Bar>
      <Label>Compress body</Label>
      <Select
        data-testid="compress-body-select"
        value={value}
        onChange={(e) =>
          onUpdate({
            compressRequest: e.target.value as RequestState["compressRequest"],
          })
        }
      >
        <option value="none">None</option>
        <option value="gzip">Gzip</option>
        <option value="deflate">Deflate</option>
        <option value="br">Brotli</option>
      </Select>
      {value !== "none" && <Hint>Content-Encoding: {value}</Hint>}
    </Bar>
  );
}
