import React from 'react';
import {
  EmptyHint,
  ScriptRunningBox,
  Spinner,
  TestResultIcon,
  TestResultMsg,
  TestResultName,
  TestResultRow,
  TestResultsWrapper,
  TestSummaryBar,
  TestSummaryIcon,
  TestSummaryText,
  TestSummaryTotal,
  SchemaPath,
  SchemaMsg,
} from './responsePaneStyles';

/* ─── Test Results ───────────────────────────────────── */

interface TestResultsProps {
  request?: any;
}

export const TestResults: React.FC<TestResultsProps> = ({ request }) => {
  if (request?.scriptRunning) {
    return (
      <ScriptRunningBox>
        <Spinner $size={14} />
        Running tests…
      </ScriptRunningBox>
    );
  }

  const tests: Record<string, boolean> = request?.scriptTests || {};
  const messages: Record<string, string> = request?.scriptTestMessages || {};
  const entries = Object.entries(tests);
  if (entries.length === 0) {
    return (
      <EmptyHint>
        No test assertions defined. Use{' '}
        <code>{'tests["name"] = true'}</code> or{' '}
        <code>{'pm.test("name", () => pm.expect(...))'}</code> in your
        post-response script.
      </EmptyHint>
    );
  }

  const passed = entries.filter(([, v]) => v).length;
  const failed = entries.filter(([, v]) => !v).length;

  return (
    <TestResultsWrapper>
      <TestSummaryBar $allPassed={failed === 0}>
        <TestSummaryIcon>{failed === 0 ? '✓' : '✗'}</TestSummaryIcon>
        <TestSummaryText>
          {passed} passed{failed > 0 ? `, ${failed} failed` : ''}
        </TestSummaryText>
        <TestSummaryTotal>{entries.length} total</TestSummaryTotal>
      </TestSummaryBar>
      {entries.map(([name, result]) => (
        <div key={name}>
          <TestResultRow $passed={result}>
            <TestResultIcon $passed={result}>{result ? '✓' : '✗'}</TestResultIcon>
            <TestResultName>{name}</TestResultName>
          </TestResultRow>
          {!result && messages[name] && (
            <TestResultMsg>{messages[name]}</TestResultMsg>
          )}
        </div>
      ))}
    </TestResultsWrapper>
  );
};

/* ─── Schema Validation Results (F22) ─────────────────── */

interface SchemaResultsProps {
  schemaValidation?: any;
}

export const SchemaResults: React.FC<SchemaResultsProps> = ({ schemaValidation }) => {
  if (!schemaValidation) {
    return (
      <EmptyHint>
        No schema validation configured. Open the request&apos;s{' '}
        <code>Schema</code> tab, paste a JSON Schema, and enable{' '}
        <code>Validate response</code>.
      </EmptyHint>
    );
  }

  if (schemaValidation.valid) {
    return (
      <TestResultsWrapper>
        <TestSummaryBar $allPassed>
          <TestSummaryIcon>✓</TestSummaryIcon>
          <TestSummaryText>Response matches the JSON Schema</TestSummaryText>
          <TestSummaryTotal>valid</TestSummaryTotal>
        </TestSummaryBar>
      </TestResultsWrapper>
    );
  }

  const errors: Array<{ path: string; keyword: string; message: string }> =
    schemaValidation.errors || [];

  return (
    <TestResultsWrapper>
      <TestSummaryBar $allPassed={false}>
        <TestSummaryIcon>✗</TestSummaryIcon>
        <TestSummaryText>Response does not match the JSON Schema</TestSummaryText>
        <TestSummaryTotal>
          {schemaValidation.errorCount ?? errors.length} error
          {(schemaValidation.errorCount ?? errors.length) === 1 ? '' : 's'}
        </TestSummaryTotal>
      </TestSummaryBar>
      {errors.map((err, idx) => (
        <TestResultRow key={`${err.path}-${idx}`} $passed={false}>
          <TestResultIcon $passed={false}>✗</TestResultIcon>
          <SchemaPath>{err.path}</SchemaPath>
          <SchemaMsg>{err.message}</SchemaMsg>
        </TestResultRow>
      ))}
    </TestResultsWrapper>
  );
};
