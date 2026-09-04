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

  // -- extension: settings shell -------------------------------------------
  'ext.settings.title': 'Settings',
  'ext.settings.sections': 'Settings sections',
  'ext.settings.close': 'Close settings',
  'ext.settings.tab.provider': 'AI Provider',
  'ext.settings.tab.integrations': 'Integrations',
  'ext.settings.tab.templates': 'Templates',
  'ext.settings.tab.data': 'Data & MCP',
  'ext.settings.save': 'Save',
  'ext.settings.testConnection': 'Test connection',
  'ext.settings.testing': 'Testing…',

  // -- extension: language --------------------------------------------------
  'ext.settings.language': 'Language',
  'ext.settings.languageHint':
    '“Follow system” uses your browser’s language. This changes the interface only — meeting notes keep the language they were spoken in.',

  // -- extension: provider panel -------------------------------------------
  'ext.provider.label': 'Provider',
  'ext.provider.builtinHint':
    'No configuration — uses the browser’s built-in AI (Gemini Nano) when available. For the best results pick a cloud or local provider above.',
  'ext.provider.apiKey': 'API Key',
  'ext.provider.apiKeyOptional': 'API Key (optional)',
  'ext.provider.apiKeyPlaceholder': 'leave empty if the endpoint needs no auth',
  'ext.provider.apiKeyHintRequired': 'Sent as {header} · stored encrypted (AES-GCM).',
  'ext.provider.apiKeyHintOptional': 'Sent as {header} when filled in · stored encrypted (AES-GCM).',
  'ext.provider.baseUrl': 'Base URL',
  'ext.provider.azureHint': 'The Azure resource endpoint; the model is the deployment name.',
  'ext.provider.model': 'Model',
  'ext.provider.modelPlaceholder': 'model / deployment name',
  'ext.provider.loadModels': 'Load models',
  'ext.provider.loadingModels': 'Loading…',
  'ext.provider.modelsAvailable':
    '{count} models available — click the field to pick one, or type your own.',
  'ext.provider.modelsPrompt': 'Click “Load models” to fetch the list from the provider.',
  'ext.provider.retention': 'Keep history',
  'ext.provider.retentionForever': 'Forever (default)',
  'ext.provider.retentionDays': 'Delete automatically after {days} days',
  'ext.provider.retentionHintForever': 'Nothing is deleted automatically.',
  'ext.provider.retentionHintDays':
    'Meetings inactive for more than {days} days are deleted permanently — transcript, notes, chat and documents. This cannot be undone.',

  // -- extension: dashboard shell -------------------------------------------
  'ext.tab.summary': 'Summary',
  'ext.tab.transcript': 'Transcript',
  'ext.tab.diagram': 'Diagram',
  'ext.tab.ask': 'Ask',
  'ext.tab.docs': 'Documents',
  'ext.meeting.views': 'Meeting views',
  'ext.meeting.nameLabel': 'Meeting name',
  'ext.meeting.rename': '{id} — click to rename',
  'ext.meeting.transcriptLines': '{count} transcript lines',
  'ext.meeting.transcriptGeneric': 'the transcript',
  'ext.meeting.confirmDelete':
    'Delete “{label}”?\n\n{lines}, notes, chat and documents are all deleted permanently. This cannot be undone.',
  'ext.meeting.deleted': 'Meeting {label} deleted.',
  'ext.empty.title': 'No meetings recorded yet.',
  'ext.empty.hint':
    'Join a Google Meet — captions turn on by themselves, and the transcript and AI notes appear here.',

  // -- extension: sidebar ---------------------------------------------------
  'ext.sidebar.theme': 'Theme: {mode}',
  'ext.sidebar.liveCount': '{count} meetings in progress',
  'ext.sidebar.searchAll': 'Search all meetings',
  'ext.sidebar.searchAllShortcut': 'Search all meetings (⌘K)',
  'ext.sidebar.knowledge': 'Knowledge base across meetings',
  'ext.sidebar.decisions': 'Decisions & carry-over',
  'ext.sidebar.settings': 'Settings',
  'ext.sidebar.project': 'Project',
  'ext.sidebar.projectFilter': 'Filter by project',
  'ext.sidebar.allMeetings': 'All meetings',
  'ext.sidebar.live': 'In progress',
  'ext.sidebar.history': 'History',
  'ext.sidebar.lines': '{count} lines',
  'ext.sidebar.deleteMeeting': 'Delete meeting {label}',
  'ext.sidebar.deleteMeetingHint': 'Delete meeting (transcript, notes, chat)',
  'ext.sidebar.collapse': 'Collapse sidebar',
  'ext.sidebar.expand': 'Expand sidebar',

  // -- extension: meeting header -------------------------------------------
  'ext.header.agendaPlaceholder': 'Meeting agenda (optional)',
  'ext.header.agenda': 'Meeting agenda',
  'ext.header.openActions': ' · {count} action items',
  'ext.header.openQuestions': ' · {count} open questions',

  // -- extension: command palette ------------------------------------------
  'ext.palette.search': 'Search all meetings',
  'ext.palette.placeholder': 'Search across meetings — decisions, action items, words in the transcript…',
  'ext.palette.keywords': 'Search keywords',
  'ext.palette.empty': 'No results.',
  'ext.palette.keys': '↑↓ move · Enter open · Esc close',
  'ext.kind.decision': 'Decision',
  'ext.kind.action': 'Action item',
  'ext.kind.question': 'Open question',
  'ext.kind.transcript': 'Transcript',
  'ext.kind.document': 'Document',

  // -- extension: decision log ----------------------------------------------
  'ext.decisions.copied': 'Carry-over agenda copied.',
  'ext.decisions.close': 'Close',
  'ext.decisions.heading': 'Decisions — {count}',
  'ext.decisions.emptyTopic': 'No decisions on this topic.',
  'ext.decisions.empty': 'No decisions recorded yet.',
  'ext.decisions.carryHeading': 'Carry into the next meeting — {count}',
  'ext.decisions.noOpenQuestions': 'No open questions.',

  // -- extension: diagram ---------------------------------------------------
  'ext.diagram.copied': 'Mermaid source copied.',
  'ext.diagram.renderFailed': 'This diagram could not be rendered: {message}',

  // -- extension: shared failures -------------------------------------------
  'ext.failed': 'Failed: {error}',
  'ext.unknownError': 'unknown',

  // -- extension: diagram ---------------------------------------------------
  'ext.diagram.needSummary': 'Create the Summary first',
  'ext.diagram.generating': 'Generating…',
  'ext.diagram.regenerate': '↻ Regenerate diagrams',
  'ext.diagram.generate': '✨ Generate diagrams',
  'ext.diagram.empty': 'No diagrams yet.',
  'ext.diagram.hint':
    'Draw a flow diagram from meeting {id} when it covers a process or a sequence of steps. On demand — uses the cleaned transcript once one exists.',
  'ext.diagram.hintNoSummary': 'Create the Summary first, then diagrams can be generated here.',

  // -- extension: documents -------------------------------------------------
  'ext.docs.kinds': 'Document types',
  'ext.docs.generating': 'being generated',
  'ext.docs.generated': 'already generated',
  'ext.docs.template': 'Document template',
  'ext.docs.done': '{label} generated.',
  'ext.docs.pdfDownloaded': 'PDF downloaded.',
  'ext.docs.pdfFailed': 'Could not create the PDF: {error}',
  'ext.docs.markdownCopied': 'Markdown copied.',
  'ext.docs.progress':
    'The AI is writing the {label} ({stage})… {pct}% · draft → review → revise. It appears here on its own.',
  'ext.docs.meta': '{label} · created {date}',
  'ext.docs.empty': 'No {label} yet.',
  'ext.docs.stalled': 'The previous {label} run stopped. Click to start it again.',
  'ext.docs.hint':
    'Draft a {label} from the transcript of meeting {id} (draft → review → revise). It is a starting point — review it before use.',

  // -- extension: transcript ------------------------------------------------
  'ext.transcript.versions': 'Transcript version',
  'ext.transcript.cleaned': 'Transcript cleaned — {count} lines corrected.',
  'ext.transcript.copied': 'Transcript copied.',
  'ext.transcript.redoHint': 'Ignore the previous result and clean again from scratch',
  'ext.transcript.waitForEnd': 'Wait until the meeting ends',
  'ext.transcript.cleanHint': 'Fix mishearings — numbers, names, terms — with AI',
  'ext.transcript.recleanBtn': '✨ Clean again',
  'ext.transcript.speakingShare': 'Speaking share',
  'ext.transcript.detectedActions': 'Detected actions',
  'ext.transcript.waitingForSpeech': 'Waiting for someone to speak…',
  'ext.transcript.cleanNote':
    'Cleaned version — {count} lines corrected · {date}. Check anything you are unsure about.',
  'ext.transcript.renameSpeaker': 'Rename this speaker across the whole meeting',
  'ext.transcript.captured': 'What the caption caught',
  'ext.transcript.useAi': '↺ Use the AI version',
  'ext.transcript.useOriginal': 'Use the original',
  'ext.transcript.renamed': '{count} lines are now under {name}.',
  'ext.kind.deadline': 'Deadline',
  'ext.kind.risk': 'Risk',

  // -- extension: summary ---------------------------------------------------
  'ext.summary.checklistCopied': 'Checklist copied.',
  'ext.summary.noDatedActions': 'No action items carry a structured date (yyyy-mm-dd)',
  'ext.summary.icsDownloaded': '{count} calendar events downloaded.',
  'ext.summary.section.timeline': 'Discussion timeline',
  'ext.summary.momDone': 'Interim minutes created.',
  'ext.summary.notesDone': 'Notes created.',
  'ext.summary.markdownDownloaded': 'Markdown downloaded.',
  'ext.summary.obsidianDownloaded': 'Obsidian note downloaded (Meetings/ folder).',
  'ext.summary.processing': 'Working…',
  'ext.summary.restart': '↻ Start again',
  'ext.summary.retry': 'Try again',
  'ext.summary.analysisFailed': 'Analysis failed',
  'ext.summary.liveTitle': 'The meeting is still running.',
  'ext.summary.emptyTitle': 'No notes yet.',
  'ext.summary.liveHint':
    'Notes are written automatically once the meeting ends — or make interim minutes now from the transcript so far.',
  'ext.summary.emptyHint': 'Run the AI analysis for a summary, decisions and action items.',
  'ext.summary.makeMom': 'Make interim minutes',
  'ext.summary.generate': 'Generate now',

  // -- extension: ask -------------------------------------------------------
  'ext.ask.suggest1': 'What were the main decisions in this meeting?',
  'ext.ask.suggest2': 'Who owns the action items?',
  'ext.ask.suggest3': 'Were any deadlines mentioned?',
  'ext.ask.suggest4': 'What was left unanswered?',
  'ext.ask.grade.explicit': 'Stated directly',
  'ext.ask.grade.partial': 'Not fully discussed',
  'ext.ask.grade.inferred': 'Inferred from the discussion',
  'ext.ask.grade.notFound': 'Not discussed',
  'ext.ask.undecided': 'Not decided yet',
  'ext.ask.evidence': 'Evidence from the transcript',
  'ext.ask.cleared': 'Question history cleared.',
  'ext.ask.hint': 'Ask anything about this meeting — answered from the transcript.',
  'ext.ask.empty': 'Ask the transcript.',
  'ext.ask.placeholderLive': 'The meeting is still running — you can still ask',
  'ext.ask.placeholder': 'Write a question…',
  'ext.ask.question': 'Question',
  'ext.ask.send': 'Send',
  'ext.confidence.high': 'high',
  'ext.confidence.medium': 'medium',
  'ext.confidence.low': 'low',

  // -- extension: knowledge base --------------------------------------------
  'ext.kb.pushToTracker': 'Send to the issue tracker',
  'ext.kb.alreadyPushed': 'Already sent: {ref}',
  'ext.kb.created': 'Created: {ref}',
  'ext.kb.askPlaceholder':
    'Ask across meetings — e.g. what was decided about the migration in the last three months?',
  'ext.kb.askLabel': 'Question across meetings',
  'ext.kb.ask': 'Ask',
  'ext.kb.copyDigest': 'Copy the last 7 days as markdown',
  'ext.kb.digestCopied': 'Weekly digest copied.',
  'ext.kb.overdue': '· {count} overdue',
  'ext.kb.checkingTracker': 'Checking the tracker…',
  'ext.kb.pullTracker': 'Pull tracker status',
  'ext.kb.noOpenActions': 'No open action items.',
  'ext.kb.changedDecisions': 'Decisions that changed',
  'ext.kb.noRepeatedTopics': 'No topic has been decided more than once yet.',
  'ext.kb.noAnalysed': 'No meetings have been analysed yet.',
  'ext.kb.noOwner': 'no owner',
  'ext.kind.questionResolved': 'Answered',

  // -- extension: sign-in ---------------------------------------------------
  'ext.signin.permissionDenied': 'Permission denied — sign-in cannot run.',
  'ext.signin.requestingCode': 'Requesting a code…',
  'ext.signin.waitingApproval': 'Waiting for approval in the browser…',
  'ext.signin.exchangingCode': 'Exchanging the code…',
  'ext.signin.preparingProject': 'Preparing the Code Assist project…',
  'ext.signin.codeExpired': 'The code expired before it was approved. Try again.',
  'ext.signin.startWithGoogle': 'Start from the “Sign in with Google” button first.',
  'ext.signin.chatgptConnected': 'ChatGPT connected.',
  'ext.signin.googleConnected': 'Google connected.',
  'ext.signin.disconnected': 'Account disconnected.',
  'ext.signin.withChatgpt': 'Sign in with ChatGPT',
  'ext.signin.finish': 'Finish sign-in',

  'ext.ask.emptyHint':
    'Answers come from meeting {id} and carry their evidence — timestamp and speaker.',

  // -- extension: integrations ---------------------------------------------
  'ext.integrations.liveHighlights': 'Live highlights while the meeting runs',
  'ext.integrations.liveHighlightsHint':
    'Spots decisions, actions and deadlines from keywords alone — no AI call, so it adds no cost and sends nothing out.',
  'ext.integrations.bridge': 'Send finished meetings to Companion Desktop',
  'ext.integrations.bridgeHint':
    'Writes the meeting note into Companion Desktop’s local vault through its native messaging host — it stays on this computer and never crosses the network. Needs Companion Desktop installed; without it the extension works exactly as before and delivery is retried later.',
  'ext.bridge.test': 'Test connection',
  'ext.bridge.testing': 'Testing…',
  'ext.bridge.connected': 'Connected to Companion Desktop.',
  'ext.bridge.notConnected': 'Not connected.',
  'ext.bridge.fixHint':
    '{detail} — run {command} once more to register the host for this browser profile, then reload the extension.',
  'ext.tracker.legend': 'Issue tracker (action items)',
  'ext.tracker.provider': 'Provider',
  'ext.tracker.baseUrl': 'Base URL',
  'ext.tracker.token': 'Token',
  'ext.tracker.projectKey': 'Project key',
  'ext.tracker.teamId': 'Team id',
  'ext.tracker.databaseId': 'Database id',
  'ext.sync.legend': 'Team sync & workspace',
  'ext.sync.enable': 'Enable sync',
  'ext.sync.enableHint':
    'Optional. Transcript contents are encrypted with your passphrase before they are sent — the server never receives the key. There is no Companion service: run {server} on your own machine, or point this at your own https endpoint.',
  'ext.sync.endpoint': 'Endpoint',
  'ext.sync.token': 'Token',
  'ext.sync.workspace': 'Workspace id (optional)',
  'ext.sync.workspaceHint': 'A shared namespace for one team; empty means private.',
  'ext.sync.passphrase': 'Encryption passphrase',
  'ext.sync.passphraseHint':
    'At least 8 characters. If it is lost, anything already sent cannot be opened again — there is no recovery.',
  'ext.sync.now': 'Sync now',
  'ext.sync.syncing': 'Syncing…',
  'ext.sync.saveFirst': 'Save first if you have just changed the settings above.',
  'ext.sync.result': 'Sync: {pushed} sent, {pulled} received',
  'ext.sync.failedSuffix': ', {count} failed ({error})',
  'ext.transcription.legend': 'Recording transcription & calendar',
  'ext.transcription.endpoint': 'Speech-to-text endpoint',
  'ext.transcription.endpointHint':
    'OpenAI-compatible, including a local Whisper. Empty disables audio file import.',
  'ext.templates.saved': 'Template saved.',
  'ext.templates.intro':
    'A template sets the structure and emphasis of a document — retro notes, client minutes, and so on. The grounding rules still hold: a template changes the shape, it does not license new facts.',
  'ext.templates.delete': 'Delete',
  'ext.data.importMeeting': 'Import a meeting',
  'ext.data.transcriptOrAudio': 'Transcript or audio file',
  'ext.data.pickFile': 'Pick a file first.',
  'ext.data.imported': '{count} lines imported as {id}.',
  'ext.data.calendar': 'Calendar (.ics)',
  'ext.data.calendarFile': 'Calendar file',
  'ext.data.pickIcs': 'Pick an .ics file first.',
  'ext.data.matched': '{count} meetings matched against the calendar agenda.',
  'ext.data.matching': 'Matching…',
  'ext.data.match': 'Match agendas',
  'ext.data.share': 'Share a meeting (encrypted)',
  'ext.data.passphrase': 'Passphrase',
  'ext.data.pickMeetingFirst': 'Pick a meeting in the sidebar first',
  'ext.data.shareDownloaded': 'Share file downloaded.',
  'ext.data.shareFile': 'Share file',
  'ext.data.pickShareFirst': 'Pick a share file first.',
  'ext.data.shareImported': 'Meeting {id} imported.',
  'ext.data.backup': 'Backup',

  'ext.calendar.clientIdHint':
    'Your own client id; this extension carries no credentials of its own. Without it, calendar matching still works by importing an .ics file on the Data tab.',
  'ext.calendar.connect': 'Connect Google Calendar',
  'ext.calendar.saveFirst': 'Save the settings first so the client id is picked up.',
  'ext.templates.usedFor': 'Used for',
  'ext.templates.kindDoc': 'Documents (BRD / PRD / minutes)',
  'ext.templates.kindAnalysis': 'Meeting analysis',
  'ext.templates.instructions': 'Instructions',
  'ext.templates.instructionsPlaceholder':
    'Focus on what went well, what did not, and the experiments for the next sprint.',
  'ext.templates.sections': 'Sections (one per line, optional)',
  'ext.data.importHint':
    'A .vtt, .srt, Zoom transcript or plain text file. Audio and video recordings work too once a speech-to-text endpoint is set on the Integrations tab (max 25 MB). The result becomes an ordinary meeting: analysable, searchable and askable like one captured live.',
  'ext.data.sharePassphraseHint':
    'The recipient needs this passphrase to open the file. Anyone who has it can read the meeting.',
  'ext.data.exportSelected': 'Export the selected meeting',
  'ext.data.backupNot': 'not',
  'ext.data.backupHint': 'Every meeting in one file: transcripts, notes, chat and documents. API keys, tokens and the audit log are {not} included — which is what makes the file safe to keep, and why you have to set your AI provider up again after restoring.',
  'ext.data.restoreHint':
    'Restoring adds rather than replaces: a meeting already in this profile is not overwritten, so restoring the same file twice changes nothing.',
  'ext.data.backupDownloaded': 'Backup of {count} meetings downloaded.',
  'ext.data.downloadBackup': 'Download a backup',
  'ext.data.backupFile': 'Backup file',
  'ext.data.pickBackupFirst': 'Pick a backup file first.',
  'ext.data.restored': 'Restored: {added} new entries from {meetings} meetings',
  'ext.data.restoredSkipped': ', {count} already present',
  'ext.data.restoredNothing': 'Everything in the backup was already in this profile.',
  'ext.data.restore': 'Restore from a backup',
  'ext.mcp.legend': 'MCP & index',
  'ext.mcp.hint': 'A snapshot for the MCP server ({command}) so a coding agent can read your meetings.',
  'ext.mcp.snapshotDownloaded': 'Snapshot downloaded.',
  'ext.mcp.exportSnapshot': 'Export a snapshot',
  'ext.mcp.reindexed': 'Index rebuilt: {sessions} meetings, {entries} lines',
  'ext.mcp.rebuildIndex': 'Rebuild the index',
  'ext.export.legend': 'Obsidian export & audit log',
  'ext.export.hint':
    'A .zip vault with one Markdown note per analysed meeting, ready to open in Obsidian. The audit log is exported as JSON and never leaves this machine.',
  'ext.export.exporting': 'Exporting…',
  'ext.export.obsidian': 'Export to Obsidian (.zip)',
  'ext.export.obsidianDone': '{count} meeting notes exported to {name}.',
  'ext.export.auditDone': '{count} audit events downloaded (JSON).',

  'ext.templates.empty': 'No templates yet.',

  'ext.mcp.mismatched': ', {count} mismatched',

  // -- extension: worker errors ---------------------------------------------
  'ext.err.rateLimited': 'Too many AI requests — wait a moment and try again.',
  'ext.err.analysisRateLimited': 'Rate limit: too many analyses, try again later.',
  'ext.err.invalidRoomId': 'invalid roomId',
  'ext.err.nothingToExport': 'No meeting has a summary that could be exported yet.',
  'ext.err.actionNotFound': 'Action item not found.',
  'ext.err.syncDisabled': 'Sync is not enabled in Settings.',
  'ext.err.audioTooLarge': 'The audio file is over 25 MB — trim it, or use a text transcript.',
  'ext.err.emptyTranscription': 'Transcription came back empty.',
  'ext.err.noTranscriptLines': 'No transcript lines could be read from that file.',
  'ext.err.emptyName': 'The new name cannot be empty.',
  'ext.err.noCalendarClientId': 'Fill in the Google OAuth client id in Settings first.',
  'ext.err.noAccessToken': 'Google returned no access token.',
  'ext.err.noCanvas': 'No 2D canvas context available',

  // -- extension: remaining ------------------------------------------------
  'ext.err.meetingNotFound': 'Meeting not found.',
  'ext.err.summaryFirst': 'Create the Summary before the diagrams.',
  'ext.err.unknownDbOp': 'Unknown database operation: {op}',
  'ext.err.dbNoResponse': 'The database did not respond.',
  'ext.err.svgRenderFailed': 'Could not render the SVG to an image',
  'ext.header.carryOpen': '{count} items from earlier meetings are still open',
  'ext.header.openPrevious': 'open the earlier meeting',
  'ext.palette.askAi': 'Ask the AI about these results',
  'ext.provider.modelsFailed': 'The model list could not be fetched ({error}) — type it in instead.',
  'ext.settings.permissionFailed': 'Permission request failed: {error}',
  'ext.settings.retentionWarning':
    'Meetings inactive for more than {days} days will be deleted permanently, including their transcript and notes. Continue?',
  'ext.transcript.noOwner': 'no owner named yet',
  'ext.transcript.keywordGuess':
    'A keyword guess — the final list is written by the AI once the meeting ends.',
  'ext.kb.showDone': 'Show finished',
  'ext.diagram.nothingToDraw': 'Nothing in this meeting maps to a flow or a process.',
  'ext.signin.account': 'Account',
  'ext.signin.accountHint':
    'Use a subscription you already pay for, with no API key. This path goes through the backend the vendor’s own clients use (Codex CLI / Gemini CLI) rather than a documented public API, so it can change without warning. If you need something stable, pick an API-key provider above.',
  'ext.signin.withGoogle': 'Sign in with Google',
  'ext.signin.googleHint':
    'After you approve, the browser lands on a {address} URL that loads nothing — that is expected. Copy the whole address bar in here.',
  'ext.signin.deviceCode': 'Enter the code {code} in the tab that opened ({url}), then approve it.',
  'desktop.update.failed':
    'The update could not be installed. Try again, or download it from the releases page.',
  'desktop.update.installing': 'Installing…',
  'desktop.update.retry': 'Try again',
  'desktop.update.restart': 'Restart & install',

  'ext.ask.advise': 'A Companion analysis, beyond what the meeting covered',
  'ext.transcript.newSinceFull':
    '+{count} new lines since it was cleaned (not yet corrected). Click “{button}” to clean all of them.',

  // -- packages: AI ---------------------------------------------------------
  'pkg.ai.badJson': 'The AI returned invalid JSON',
  'pkg.ai.emptyAnswer': 'The AI returned an empty answer',
  'pkg.ai.emptyQuestion': 'Empty question',
  'pkg.ai.emptySummary': 'executiveSummary is empty',
  'pkg.ai.emptyMerged': 'The merged summary is empty',
  'pkg.ai.emptyResponse': 'The AI response was empty',
  'pkg.ai.emptyDraft': 'The document draft is empty',
  'pkg.ai.noBuiltin':
    'This browser has no built-in AI. Pick a provider in Settings.',

  // -- packages: OAuth ------------------------------------------------------
  'pkg.oauth.noJson': 'The auth service did not return JSON',
  'pkg.oauth.noAccessToken': 'The response carried no access token',
  'pkg.oauth.noDeviceCode': 'The response carried no device code',
  'pkg.oauth.noAuthCode': 'The approval carried no authorization code',
  'pkg.oauth.stateMismatch': 'That URL belongs to a different sign-in attempt. Start again.',
  'pkg.oauth.noCodeInUrl': 'That URL carries no authorization code.',
  'pkg.oauth.noProject':
    'Code Assist did not create one. Fill in the Project ID below and sign in again.',
  'pkg.oauth.needProject': 'Fill in your Google Cloud Project ID below and sign in again.',
  'pkg.oauth.onboardTimeout': 'Onboarding did not finish. Try signing in again.',

  // -- packages: meeting ----------------------------------------------------
  'pkg.meeting.noTranscriptionEndpoint': 'No transcription endpoint is set in Settings.',
  'pkg.meeting.invalidBundle': 'Invalid meeting bundle.',
  'pkg.meeting.notFound': 'Meeting not found.',
  'pkg.meeting.emptyTranscript': 'The transcript is still empty.',
  'pkg.meeting.notifyReady': 'Notes ready ✓',
  'pkg.meeting.notifyReadyBody': 'Meeting {id} has been analysed.',
  'pkg.meeting.notifyFailed': 'Analysis failed',
  'pkg.tracker.noToken': 'The integration token is not set.',
  'pkg.tracker.noTarget': 'The project / team / database id is not set.',
  'pkg.tracker.jiraTokenFormat': 'A Jira token must be formatted as email:api-token.',

  // -- packages: shared -----------------------------------------------------
  'pkg.backup.unrecognised': 'That backup file was not recognised.',
  'pkg.backup.empty': 'The backup holds no data.',
  'pkg.crypto.emptyPassphrase': 'The passphrase is empty.',
  'pkg.crypto.unknownFormat': 'Unknown encrypted format.',

  // -- packages: exporters --------------------------------------------------
  'pkg.export.transcriptLines': '- **Transcript lines**: {count}',
  'pkg.export.participants': 'Participants:',
  'pkg.export.lines': '{count} lines',
  'pkg.export.noActionItems': '- [ ] (no action items)',

  'pkg.issue.source': 'Source: meeting {where}',
  'pkg.issue.owner': 'Owner (from the meeting): {owner}',
  'pkg.issue.due': 'Due (from the meeting): {due}',
  'pkg.issue.footer': 'Created automatically by Companion.',
  'pkg.docgen.footer':
    '_Draft document written by Meet Companion AI — powered by suiflex. Review it before use._',

  'pkg.ask.noRelevantPart': 'No part of the meeting covers this.',
  'pkg.ask.noRelevantMeeting': 'No stored meeting covers this.',
  'pkg.agenda.noOpenQuestions': '_No open questions remain._',
  'pkg.digest.noActivity': '_No meeting activity in this period._',

  'ext.kb.actionItems': 'Action items',

  'pkg.docgen.stage.context': 'Preparing context',
  'pkg.docgen.stage.draft': 'Writing the draft',
  'pkg.docgen.stage.review': 'Checking and validating',
  'pkg.docgen.stage.done': 'Done',
  'pkg.oauth.notAUrl': 'That is not a URL. Copy the whole address bar.',

  'desktop.meeting.participants': 'Participants',
  'desktop.meeting.showTranscript': 'Show transcript',
  'desktop.meeting.hideTranscript': 'Hide transcript',
  'desktop.meeting.loadingTranscript': 'Reading the transcript…',
  'desktop.meeting.emptyTranscript': 'The transcript sidecar is empty.',
  'desktop.meeting.openInExtension': 'Open in the extension',
  'desktop.meeting.copyLink': 'Copy link',
  'desktop.meeting.copied': 'Copied',

  'desktop.settings.resetVault': 'Back to default',
  'desktop.settings.moveHere': 'Move the vault here',
  'desktop.settings.confirmReset':
    'Go back to the default vault at ~/Companion? Nothing in the current folder is deleted.',
  'desktop.settings.confirmExistingVault':
    'Use the Companion vault at {path}? Notes there will appear here; nothing is moved or deleted.',
  'desktop.settings.confirmForeignFolder':
    '{path} is not a Companion vault and holds {count} markdown files — all of them would be listed as notes. Companion will create a .transcript folder inside it. Continue?',
  'desktop.settings.confirmEmptyFolder':
    'Use {path} as the vault? Companion will create a .transcript folder inside it. Nothing in your current vault is moved or deleted.',
  'desktop.settings.cancel': 'Cancel',

  'desktop.editor.blockPlaceholder': "Type '/' for commands",

  // -- desktop: updater -----------------------------------------------------
  'desktop.update.available': 'Version {version} is available.',
} as const;
