import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { installErrorReporting } from './utils/errorReporter';
import { applySiteTheme, storedSiteTheme } from './utils/siteTheme';

installErrorReporting();
// The dashboard colours from the last visit, before the first paint (SiteTheme refreshes them).
applySiteTheme(storedSiteTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
