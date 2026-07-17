import React from 'react';
import ReactDOM from 'react-dom/client';
import { BottomViewRoot } from './BottomView';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <BottomViewRoot />
  </React.StrictMode>,
);
