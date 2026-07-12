import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, restifyTheme } from './theme';
import GlobalStyles from './theme/GlobalStyles';
import { MainPanel } from './mainPanel';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={restifyTheme}>
      <GlobalStyles />
      <MainPanel />
    </ThemeProvider>
  </React.StrictMode>
);
