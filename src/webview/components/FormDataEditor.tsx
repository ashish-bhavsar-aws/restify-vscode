import React from 'react';
import { FormDataItem, RequestState } from '../types';
import { Icon, faTrash } from './FaIcon';
import { getSuggestedContentType } from '../utils/formDataTypeDetector';
import {
  BodyEditorWrap,
  CtypeBadge,
  CtypeClearBtn,
  CtypeFileRow,
  CtypeLabel,
  CtypeRow,
  CtypeUseBtn,
  FormAddBtn,
  FormCheck,
  FormDelBtn,
  FormFileInput,
  FormFileName,
  FormFileWrap,
  FormInput,
  FormKeyWrap,
  FormRow,
  FormTypeSelect,
  FormWrap,
  ScrollContainer,
} from './requestPaneStyles';

interface FormDataEditorProps {
  items: FormDataItem[];
  onUpdate: (updates: Partial<RequestState>) => void;
}

export const FormDataEditor: React.FC<FormDataEditorProps> = ({ items, onUpdate }) => {
  const updateFormDataRow = (index: number, updates: Partial<FormDataItem>) => {
    const next = [...items];
    next[index] = { ...next[index], ...updates };
    onUpdate({ formData: next });
  };

  const handleSelectFormFile = (index: number, file?: File | null) => {
    if (!file) {
      updateFormDataRow(index, {
        fileName: '',
        fileContentBase64: '',
        contentType: '',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) return;

      const bytes = new Uint8Array(result);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }

      updateFormDataRow(index, {
        formType: 'file',
        value: '',
        fileName: file.name,
        fileContentBase64: btoa(binary),
        contentType: file.type || 'application/octet-stream',
      });
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <BodyEditorWrap>
      <ScrollContainer style={{ flex: 1 }}>
        <FormWrap>
          {items.map((item, i) => {
            const rowType = item.formType || 'text';
            const suggestedContentType = rowType === 'text' ? getSuggestedContentType(item.value || '', item.contentType) : undefined;
            const shouldShowTextContentType = rowType === 'text' && ((item.contentType || '').trim().length > 0 || !!suggestedContentType);
            return (
              <FormRow key={i}>
                <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                  <FormCheck>
                    <input
                      type="checkbox"
                      checked={item.enabled !== false}
                      onChange={(e) => updateFormDataRow(i, { enabled: e.target.checked })}
                    />
                  </FormCheck>
                  <FormKeyWrap>
                    <FormInput
                      type="text"
                      placeholder="Key"
                      value={item.key}
                      onChange={(e) => updateFormDataRow(i, { key: e.target.value })}
                    />
                    <FormTypeSelect
                      value={rowType}
                      onChange={(e) => {
                        const nextType = e.target.value as 'text' | 'file';
                        updateFormDataRow(i, {
                          formType: nextType,
                          value: nextType === 'text' ? item.value || '' : '',
                          fileName: nextType === 'file' ? item.fileName || '' : '',
                          fileContentBase64: nextType === 'file' ? item.fileContentBase64 || '' : '',
                          contentType: nextType === 'file' ? item.contentType || '' : '',
                        });
                      }}
                      title={rowType === 'text' ? 'Text value' : 'File upload'}
                    >
                      <option value="text">T</option>
                      <option value="file">F</option>
                    </FormTypeSelect>
                  </FormKeyWrap>

                  {rowType === 'file' ? (
                    <FormFileWrap>
                      <FormFileInput
                        type="file"
                        onChange={(e) => handleSelectFormFile(i, e.target.files?.[0])}
                      />
                      <FormFileName
                        $hasFile={!!item.fileName}
                        title={item.fileName || 'No file selected'}
                      >
                        {item.fileName || 'No file selected'}
                      </FormFileName>
                    </FormFileWrap>
                  ) : (
                    <FormInput
                      type="text"
                      placeholder="Value"
                      value={item.value || ''}
                      onChange={(e) => updateFormDataRow(i, { value: e.target.value })}
                    />
                  )}

                  <FormDelBtn onClick={() => onUpdate({ formData: items.filter((_, idx) => idx !== i) })}>
                    <Icon icon={faTrash} size={12} />
                  </FormDelBtn>
                </div>

                {shouldShowTextContentType && (
                  <CtypeRow>
                    <CtypeLabel>Runtime Content-Type:</CtypeLabel>
                    <CtypeBadge title={item.contentType || suggestedContentType || 'text/plain'}>
                      {item.contentType || suggestedContentType || 'text/plain'}
                    </CtypeBadge>
                    {!item.contentType && suggestedContentType && (
                      <CtypeUseBtn
                        onClick={() => updateFormDataRow(i, { contentType: suggestedContentType })}
                        title={`Use ${suggestedContentType}`}
                      >
                        Use
                      </CtypeUseBtn>
                    )}
                    {item.contentType && (
                      <CtypeClearBtn
                        onClick={() => updateFormDataRow(i, { contentType: '' })}
                        title="Clear custom content type"
                      >
                        Clear
                      </CtypeClearBtn>
                    )}
                  </CtypeRow>
                )}

                {rowType === 'file' && (
                  <CtypeFileRow>
                    <FormInput
                      type="text"
                      placeholder="Content-Type (e.g., application/pdf, image/png)"
                      value={item.contentType || ''}
                      onChange={(e) => updateFormDataRow(i, { contentType: e.target.value })}
                      title="MIME type for the uploaded file"
                      style={{ flex: 1 }}
                    />
                  </CtypeFileRow>
                )}
              </FormRow>
            );
          })}
          <FormAddBtn
            onClick={() =>
              onUpdate({
                formData: [
                  ...items,
                  { key: '', value: '', enabled: true, formType: 'text' },
                ],
              })
            }
          >
            + Add Field
          </FormAddBtn>
        </FormWrap>
      </ScrollContainer>
    </BodyEditorWrap>
  );
};
