// English catalogue — the source of truth.
//
// `MessageKey` is derived from this object, so every other catalogue is typed
// against it: a key added here without a translation is a type error in
// `id.ts`, not a silent fall back to English at runtime.
//
// Keys are dotted and grouped by where they appear. Placeholders are `{name}`.
// Keep a string whole rather than assembling it from fragments — word order is
// not the same in every language, and a sentence stitched together in code
// cannot be reordered by a translator.
export const en = {
  // -- desktop: shell -------------------------------------------------------
  'desktop.nav.notes': 'Notes',
  'desktop.nav.inbox': 'Incoming meetings',
  'desktop.nav.settings': 'Vault & bridge',
  'desktop.nav.theme': 'Theme: {mode}',
  'desktop.badge.local': 'Saved locally, never synced',

  // -- desktop: note list ---------------------------------------------------
  'desktop.vault.kicker': 'Vault',
  'desktop.vault.count': '{count} notes',
  'desktop.vault.newNote': 'New note',
  'desktop.vault.preparing': 'Preparing the vault…',
  'desktop.vault.search': 'Search notes…',
  'desktop.vault.searchTitlesOnly': 'Search titles (index unavailable)…',
  'desktop.vault.empty': 'No notes yet.',
  'desktop.vault.bodyHit': 'matched inside the note body',

  // -- desktop: inbox -------------------------------------------------------
  'desktop.inbox.kicker': 'Incoming meetings',
  'desktop.inbox.count': '{count} meetings',
  'desktop.inbox.participants': '{count} participants',
  'desktop.inbox.transcriptOnly': 'transcript only',
  'desktop.inbox.empty':
    'No meetings have arrived yet. Turn on “Send finished meetings to Companion Desktop” in the extension settings, then press “Test connection” there.',

  // -- desktop: editor ------------------------------------------------------
  'desktop.editor.titlePlaceholder': 'Note title',
  'desktop.editor.bodyPlaceholder': 'Write here…',
  'desktop.editor.unsaved': 'unsaved',
  'desktop.editor.updated': 'updated {date}',
  'desktop.editor.trash': 'Move to trash',
  'desktop.editor.save': 'Save',
  'desktop.editor.newNoteTitle': 'New note',
  'desktop.editor.emptyTitle': 'Companion Desktop',
  'desktop.editor.emptyBody':
    'Open or create a note in the local vault. Everything is a plain .md file you can edit in any editor.',
  'desktop.editor.confirmUnsaved': 'This note has unsaved changes.',
  'desktop.editor.discard': 'Discard changes',
  'desktop.editor.saveAndGo': 'Save and continue',

  // -- desktop: ticket fields ----------------------------------------------
  'desktop.field.status': 'Status',
  'desktop.field.priority': 'Priority',
  'desktop.field.assignee': 'Assignee',
  'desktop.field.due': 'Due',
  'desktop.field.assigneePlaceholder': 'who',
  'desktop.field.none': '—',
  'desktop.status.todo': 'To Do',
  'desktop.status.inProgress': 'In Progress',
  'desktop.status.blocked': 'Blocked',
  'desktop.status.done': 'Done',
  'desktop.priority.low': 'Low',
  'desktop.priority.medium': 'Medium',
  'desktop.priority.high': 'High',
  'desktop.priority.urgent': 'Urgent',

  // -- desktop: date picker -------------------------------------------------
  'desktop.date.pick': 'Pick a date',
  'desktop.date.dialog': 'Pick a date',
  'desktop.date.clear': 'Clear due date',
  'desktop.date.prevMonth': 'Previous month',
  'desktop.date.nextMonth': 'Next month',
  'desktop.date.today': 'Today',

  // -- desktop: settings ----------------------------------------------------
  'desktop.settings.title': 'Vault & bridge',
  'desktop.settings.theme': 'Theme',
  'desktop.settings.themeHint':
    '“Follow system” matches macOS or Windows and changes on its own when the system switches between light and dark.',
  'desktop.settings.language': 'Language',
  'desktop.settings.languageHint':
    '“Follow system” uses your operating system’s language. This changes the interface only — meeting notes keep the language they were spoken in.',
  'desktop.settings.vaultLocation': 'Vault location',
  'desktop.settings.vaultHint':
    '{count} notes. All ordinary .md files — openable in any editor, and safe to copy or back up like any other folder.',
  'desktop.settings.moveVault': 'Move folder…',
  'desktop.settings.pickVault': 'Choose a vault folder',
  'desktop.settings.bridge': 'Extension bridge',
  'desktop.settings.bridgeHint':
    'The extension sends finished meetings to this vault through its native messaging host, once the host is registered and the toggle is on in the extension settings. Delivery is optional — the desktop app works without it.',
  'desktop.settings.index': 'Search index',
  'desktop.settings.indexHint':
    'Rebuilt from the .md files every time the note list refreshes. The index is derived: deleting it never loses a note.',

  // -- theme and language options -------------------------------------------
  'pref.system': 'Follow system',
  'pref.light': 'Light',
  'pref.dark': 'Dark',
  'lang.en': 'English',
  'lang.id': 'Indonesian',

  // -- desktop: updater -----------------------------------------------------
  'desktop.update.available': 'Version {version} is available.',
} as const;
