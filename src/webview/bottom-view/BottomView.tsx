import React, { useEffect, useState } from 'react';
import './BottomView.css';

declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscodeApi = acquireVsCodeApi();

export interface ActivityEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  title: string;
  detail?: string;
}

export function BottomView(): JSX.Element {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  const handleClear = () => {
    setEntries([]);
    vscodeApi.postMessage({ command: 'clearEntries' });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.command === 'setEntries') {
        setEntries(message.entries || []);
      }
    };

    window.addEventListener('message', handleMessage);
    vscodeApi.postMessage({ command: 'activityReady' });
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="bottom-view">
      <div className="bottom-view__toolbar">
        <span className="bottom-view__title">Activity</span>
        <button className="bottom-view__clear" type="button" onClick={handleClear}>
          Clear
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="empty-state">No activity yet.</div>
      ) : (
        <div className="entry-list">
          {[...entries].reverse().map((entry) => (
            <div key={entry.id} className={`entry entry--${entry.level || 'info'}`}>
              <div className="entry__header">
                <span className="entry__title">{entry.title}</span>
                <span className="entry__time">{entry.timestamp}</span>
              </div>
              {entry.detail ? <div className="entry__detail">{entry.detail}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
