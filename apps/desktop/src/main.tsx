import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme, loadThemePref } from './theme';
import './styles.css';

// Before first paint: a theme applied after mount is a flash of the wrong one.
applyTheme(loadThemePref());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
