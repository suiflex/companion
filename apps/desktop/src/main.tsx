import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './toast';
import { applyTheme, loadThemePref } from './theme';
import { applyLang, loadLangPref } from './lang';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { setFetch, setOAuthFetch } from '@meetcc/ai';
import './styles.css';

// Before first paint: a theme or language applied after mount is a flash of
// the wrong one.
applyTheme(loadThemePref());
applyLang(loadLangPref());

// Provider calls leave through Rust. This window's CSP allows `connect-src
// 'self' ipc:` and nothing else, and the hosts to allow cannot be listed —
// the base URL is typed by the user. Installed once, before anything can call
// a provider; the extension keeps the global fetch and is untouched.
setFetch((url, init) => tauriFetch(url, init));
setOAuthFetch((url, init) => tauriFetch(url, init));

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
