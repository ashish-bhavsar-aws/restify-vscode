import React from "react";
import styled from "styled-components";
import { computeDiff, type DiffLine } from "../../core/responseDiff";

interface ResponseDiffProps {
  leftBody: string;
  rightBody: string;
  leftLabel?: string;
  rightLabel?: string;
}

const DiffWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: var(--vscode-editor-font-size, 12px);
`;

const DiffHeader = styled.div`
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  background: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
`;

const DiffLabel = styled.span`
  font-weight: 600;
`;

const DiffStats = styled.span`
  margin-left: auto;
  color: var(--vscode-descriptionForeground);
`;

const DiffContainer = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

const DiffPane = styled.div`
  flex: 1;
  overflow: auto;
  border-right: 1px solid var(--vscode-panel-border);

  &:last-child {
    border-right: none;
  }
`;

const DiffPaneHeader = styled.div`
  padding: 4px 12px;
  background: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  position: sticky;
  top: 0;
  z-index: 1;
`;

const DiffLineRow = styled.div<{ $type: DiffLine["type"] }>`
  display: flex;
  min-height: 20px;
  background: ${({ $type }) => {
    switch ($type) {
      case "added":
        return "var(--vscode-diffEditor-insertedTextBackground, rgba(155, 189, 107, 0.2))";
      case "removed":
        return "var(--vscode-diffEditor-removedTextBackground, rgba(255, 22, 28, 0.2))";
      default:
        return "transparent";
    }
  }};
  border-left: 3px solid ${({ $type }) => {
    switch ($type) {
      case "added":
        return "var(--vscode-gitDecoration-addedResourceForeground, #73c991)";
      case "removed":
        return "var(--vscode-gitDecoration-deletedResourceForeground, #f47067)";
      default:
        return "transparent";
    }
  }};
`;

const LineNumber = styled.span`
  min-width: 40px;
  padding: 0 8px;
  text-align: right;
  color: var(--vscode-editorLineNumber-foreground, #858585);
  user-select: none;
  flex-shrink: 0;
`;

const LineContent = styled.span`
  flex: 1;
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-all;
`;

const EmptyPane = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
`;

function DiffLineView({ line, showLeft }: { line: DiffLine; showLeft: boolean }) {
  const lineNum = showLeft ? line.leftLineNum : line.rightLineNum;
  const lineType = showLeft
    ? line.type === "removed"
      ? "removed"
      : "equal"
    : line.type === "added"
      ? "added"
      : "equal";

  return (
    <DiffLineRow $type={lineType}>
      <LineNumber>{lineNum ?? ""}</LineNumber>
      <LineContent>
        {line.type === "removed" && showLeft ? line.content : line.type === "added" && !showLeft ? line.content : line.type === "equal" ? line.content : ""}
      </LineContent>
    </DiffLineRow>
  );
}

export const ResponseDiff: React.FC<ResponseDiffProps> = ({
  leftBody,
  rightBody,
  leftLabel = "Previous",
  rightLabel = "Current",
}) => {
  const diff = React.useMemo(() => computeDiff(leftBody, rightBody), [leftBody, rightBody]);

  const leftLines = React.useMemo(
    () => diff.lines.filter((l) => l.type === "equal" || l.type === "removed"),
    [diff.lines]
  );

  const rightLines = React.useMemo(
    () => diff.lines.filter((l) => l.type === "equal" || l.type === "added"),
    [diff.lines]
  );

  return (
    <DiffWrapper>
      <DiffHeader>
        <DiffLabel>{leftLabel}</DiffLabel>
        <DiffLabel>{rightLabel}</DiffLabel>
        <DiffStats>
          {diff.stats.unchanged} unchanged, {diff.stats.added} added, {diff.stats.removed} removed
        </DiffStats>
      </DiffHeader>
      <DiffContainer>
        <DiffPane>
          <DiffPaneHeader>{leftLabel} ({diff.stats.totalLeft} lines)</DiffPaneHeader>
          {leftLines.map((line, i) => (
            <DiffLineView key={`left-${i}`} line={line} showLeft />
          ))}
          {leftLines.length === 0 && <EmptyPane>No content</EmptyPane>}
        </DiffPane>
        <DiffPane>
          <DiffPaneHeader>{rightLabel} ({diff.stats.totalRight} lines)</DiffPaneHeader>
          {rightLines.map((line, i) => (
            <DiffLineView key={`right-${i}`} line={line} showLeft={false} />
          ))}
          {rightLines.length === 0 && <EmptyPane>No content</EmptyPane>}
        </DiffPane>
      </DiffContainer>
    </DiffWrapper>
  );
};
