import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// always opened as a detached window by background.js (?meeting=<id> selects
// a meeting); the anchored action-popup mode is gone, so always fill the window
const params = new URLSearchParams(location.search);
const initialMeeting = params.get('meeting');
document.body.classList.add('windowed');

// apply the persisted theme before first paint so there's no flash
const { theme } = await chrome.storage.local.get('theme');
document.body.dataset.theme = theme === 'light' ? 'light' : 'dark';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialMeeting={initialMeeting} />
  </StrictMode>,
);
