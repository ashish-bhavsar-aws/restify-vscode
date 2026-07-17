import styled from 'styled-components';

export const HelperText = styled.span`
  display: block;
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 8px;
  opacity: 0.8;
  margin-top: -6px;
`;

export const FieldLabel = styled.label`
  display: block;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 4px;
`;

export const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  cursor: pointer;
  font-size: 12px;
  color: ${({ theme }) => theme.fg};
  input {
    cursor: pointer;
  }
`;
