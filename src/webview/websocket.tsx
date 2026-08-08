import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, restifyTheme } from './theme';
import GlobalStyles from './theme/GlobalStyles';
import { WebSocketPanel } from './components/WebSocketPanel';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={restifyTheme}>
      <GlobalStyles />
      <WebSocketPanel />
    </ThemeProvider>
  </React.StrictMode>
);
