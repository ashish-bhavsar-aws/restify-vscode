import React from 'react';
import ReactDOM from 'react-dom/client';
import { MainPanel } from './mainPanel';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <MainPanel />
  </React.StrictMode>
);

