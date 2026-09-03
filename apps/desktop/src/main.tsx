import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme, loadThemePref } from './theme';
import { applyLang, loadLangPref } from './lang';
import './styles.css';

// Before first paint: a theme or language applied after mount is a flash of
// the wrong one.
applyTheme(loadThemePref());
applyLang(loadLangPref());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
