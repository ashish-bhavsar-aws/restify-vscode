import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, restifyTheme } from './theme';
import GlobalStyles from './theme/GlobalStyles';
import { Sidebar } from './sidebar';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={restifyTheme}>
      <GlobalStyles />
      <Sidebar />
    </ThemeProvider>
  </React.StrictMode>
);
