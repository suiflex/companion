export const links = {
  github: 'https://github.com/suiflex/companion',
  discord: 'https://discord.gg/Ysh8h7wnAt',
  releases: 'https://github.com/suiflex/companion/releases/latest',
  chrome:
    'https://chromewebstore.google.com/detail/meet-companion/neeapigpheabagekbdfjdekgdicfckpn',
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/meet-companion/',
  install: 'https://github.com/suiflex/companion/blob/develop/INSTALL.md',
  privacy: 'https://github.com/suiflex/companion/blob/develop/PRIVACY.md',
  contributing:
    'https://github.com/suiflex/companion/blob/develop/CONTRIBUTING.md',
  license: 'https://github.com/suiflex/companion/blob/develop/LICENSE',
  docs: 'https://github.com/suiflex/companion/tree/develop/docs',
  issues: 'https://github.com/suiflex/companion/issues',
  suiflex: 'https://github.com/suiflex',
} as const;

export const navigation = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#workflow' },
  { label: 'Desktop', href: '#desktop' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'Open source', href: '#open-source' },
] as const;

export const faqs = [
  {
    question: 'Is Companion free and open source?',
    answer:
      'Yes. The extension and desktop app are open source under the Apache License 2.0. You can use them, inspect the code, and build them yourself. Your chosen AI provider may charge separately.',
  },
  {
    question: 'Do I need a paid AI API?',
    answer:
      'No paid API is required to capture and browse captions. AI features need a configured provider. You can use a paid API or a local model through Ollama or LM Studio. The extension also includes a Chrome built-in AI adapter, subject to browser, model, and device availability.',
  },
  {
    question: 'Where is my data stored?',
    answer:
      'The extension stores meetings in your browser profile, with a local SQLite search index. Companion Desktop stores notes as Markdown files in a vault folder, initially ~/Companion. Export a browser backup before changing profiles or uninstalling the extension; uninstalling can remove its local data.',
  },
  {
    question: 'Does Companion upload all my meetings?',
    answer:
      'Capture and search stay local. With an AI provider configured, the extension can automatically analyze a finished meeting and send its transcript to that provider. Asking questions or generating documents also sends relevant text. A remote provider has its own privacy policy. Optional tracker, calendar, sync, and transcription integrations contact the endpoints you configure; the extension also checks GitHub for updates.',
  },
  {
    question: 'Which meeting platforms are supported?',
    answer:
      'The browser extension reads displayed live captions in Google Meet, Microsoft Teams, and Zoom Web. It does not join the meeting as a bot or record your microphone or camera. In Zoom Web, turn captions on first; the platform may supply only an avatar or initial instead of a full speaker name.',
  },
  {
    question: 'What can I do with Companion Desktop?',
    answer:
      'Use it as a standalone workspace for personal notes, research, and project documents. Write formatted Markdown notes and checklists, organize folders, search your notes, attach files, and draw on whiteboards. With an AI provider configured, you can ask about your vault, draft documents, and review proposed edits. Your notes stay in local Markdown files. Connecting meeting notes from the browser extension is optional.',
  },
  {
    question: 'Do I need the desktop application?',
    answer:
      'No. The extension works on its own, and the desktop app works on its own. To deliver finished meeting notes into a Markdown vault, connect your browser from the desktop app and enable the native-messaging bridge in the extension settings. The bridge is optional and off by default.',
  },
  {
    question: 'Can I use a local AI model?',
    answer:
      'Yes. Configure Ollama, LM Studio, or a compatible local endpoint in AI settings, and run a suitable model on your machine. The model server needs to be running and accessible to Companion. Local model capabilities and hardware requirements vary.',
  },
  {
    question: 'How do I install the extension?',
    answer:
      'Install from the Chrome Web Store or Mozilla Add-ons for Firefox. The download section links to both official listings. A Chromium ZIP is also available on GitHub Releases for manual installation through Load unpacked. Store installations receive browser-managed updates; ZIP installations need manual updates. Export a backup before changing installations; removing the extension can erase its data.',
  },
  {
    question: 'Can I contribute?',
    answer:
      'Yes. Read the contributing guide for build instructions, commit conventions, and the pull request workflow. Bug fixes can go straight to a pull request. Discuss new providers, capture platforms, and stored format changes in an issue first.',
  },
] satisfies ReadonlyArray<{ question: string; answer: string }>;

export const workflow = [
  {
    title: 'Join the conversation',
    detail:
      'Meet, Teams, or Zoom Web. The extension reads the captions displayed in your browser.',
    icon: 'Video',
  },
  {
    title: 'Keep the transcript',
    detail:
      'Speaker, words, and time stay in your browser profile. No meeting bot or audio recording.',
    icon: 'Captions',
  },
  {
    title: 'Find the meaning',
    detail:
      'Your configured AI provider turns the transcript into summaries, decisions, and next steps.',
    icon: 'Sparkles',
  },
  {
    title: 'Connect the context',
    detail:
      'Search your history and ask across meetings. Bring open actions into the next conversation.',
    icon: 'Search',
  },
  {
    title: 'Make it yours',
    detail:
      'Export Markdown or PDF. Optionally deliver finished notes to your desktop Markdown vault.',
    icon: 'FolderOpen',
  },
] as const;

export const title = 'Meet Companion | Your meetings, made useful.';
export const description =
  'Capture meeting captions, find decisions and next steps with your chosen AI, and keep a searchable local archive. Open-source browser extension and Markdown desktop vault.';
