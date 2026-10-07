import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import './i18n';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorReporting } from './services/errorReporting';
import './index.css';
import './modern/modern.css';

installGlobalErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary variant="app">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
