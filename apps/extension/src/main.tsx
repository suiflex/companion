import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { resolveTheme } from './lib/theme';
import './styles.css';

// always opened as a detached window by background.js (?meeting=<id> selects
// a meeting); the anchored action-popup mode is gone, so always fill the window
const params = new URLSearchParams(location.search);
const initialMeeting = params.get('meeting');
document.body.classList.add('windowed');

// apply the persisted theme before first paint so there's no flash. Three
// preferences, one of them `system` — the default, so a fresh profile matches
// the OS instead of forcing dark. Only the resolved value reaches the DOM.
const { theme } = await chrome.storage.local.get('theme');
document.body.dataset.theme = resolveTheme(
  theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system',
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialMeeting={initialMeeting} />
  </StrictMode>,
);
