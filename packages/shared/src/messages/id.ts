// Indonesian catalogue.
//
// Typed against the English one, so a key added there and forgotten here fails
// the typecheck instead of quietly rendering English.
import type { en } from './en';

export const id: Record<keyof typeof en, string> = {
  // -- desktop: shell -------------------------------------------------------
  'desktop.nav.notes': 'Catatan',
  'desktop.nav.inbox': 'Rapat masuk',
  'desktop.nav.settings': 'Vault & jembatan',
  'desktop.nav.theme': 'Tema: {mode}',
  'desktop.badge.local': 'Tersimpan lokal, tanpa sinkron',

  // -- desktop: note list ---------------------------------------------------
  'desktop.vault.kicker': 'Vault',
  'desktop.vault.count': '{count} nota',
  'desktop.vault.newNote': 'Nota baru',
  'desktop.vault.preparing': 'Menyiapkan vault…',
  'desktop.vault.search': 'Cari nota…',
  'desktop.vault.searchTitlesOnly': 'Cari judul (indeks mati)…',
  'desktop.vault.empty': 'Belum ada nota.',
  'desktop.vault.bodyHit': 'cocok di dalam isi nota',

  // -- desktop: inbox -------------------------------------------------------
  'desktop.inbox.kicker': 'Rapat masuk',
  'desktop.inbox.count': '{count} rapat',
  'desktop.inbox.participants': '{count} peserta',
  'desktop.inbox.transcriptOnly': 'transkrip saja',
  'desktop.inbox.empty':
    'Belum ada rapat yang masuk. Nyalakan “Kirim rapat selesai ke Companion Desktop” di setelan extension, lalu tekan “Tes koneksi” di sana.',

  // -- desktop: editor ------------------------------------------------------
  'desktop.editor.titlePlaceholder': 'Judul nota',
  'desktop.editor.bodyPlaceholder': 'Tulis di sini…',
  'desktop.editor.unsaved': 'belum disimpan',
  'desktop.editor.updated': 'diperbarui {date}',
  'desktop.editor.trash': 'Pindah ke sampah',
  'desktop.editor.save': 'Simpan',
  'desktop.editor.newNoteTitle': 'Nota baru',
  'desktop.editor.emptyTitle': 'Companion Desktop',
  'desktop.editor.emptyBody':
    'Buka atau buat nota di vault lokal. Semua berkas .md, bisa diedit editor apa pun.',
  'desktop.editor.confirmUnsaved': 'Nota ini punya perubahan yang belum disimpan.',
  'desktop.editor.discard': 'Buang perubahan',
  'desktop.editor.saveAndGo': 'Simpan lalu lanjut',

  // -- desktop: ticket fields ----------------------------------------------
  'desktop.field.status': 'Status',
  'desktop.field.priority': 'Prioritas',
  'desktop.field.assignee': 'Assignee',
  'desktop.field.due': 'Tenggat',
  'desktop.field.assigneePlaceholder': 'siapa',
  'desktop.field.none': '—',
  'desktop.status.todo': 'Belum mulai',
  'desktop.status.inProgress': 'Dikerjakan',
  'desktop.status.blocked': 'Terhambat',
  'desktop.status.done': 'Selesai',
  'desktop.priority.low': 'Rendah',
  'desktop.priority.medium': 'Sedang',
  'desktop.priority.high': 'Tinggi',
  'desktop.priority.urgent': 'Mendesak',

  // -- desktop: date picker -------------------------------------------------
  'desktop.date.pick': 'Pilih tanggal',
  'desktop.date.dialog': 'Pilih tanggal',
  'desktop.date.clear': 'Hapus tenggat',
  'desktop.date.prevMonth': 'Bulan sebelumnya',
  'desktop.date.nextMonth': 'Bulan berikutnya',
  'desktop.date.today': 'Hari ini',

  // -- desktop: settings ----------------------------------------------------
  'desktop.settings.title': 'Vault & jembatan',
  'desktop.settings.theme': 'Tema',
  'desktop.settings.themeHint':
    '“Ikut sistem” mengikuti tampilan macOS atau Windows dan berubah sendiri saat sistem berganti terang atau gelap.',
  'desktop.settings.language': 'Bahasa',
  'desktop.settings.languageHint':
    '“Ikut sistem” memakai bahasa sistem operasi. Ini hanya mengubah antarmuka — notulen rapat tetap memakai bahasa yang dipakai saat rapat.',
  'desktop.settings.vaultLocation': 'Lokasi vault',
  'desktop.settings.vaultHint':
    '{count} nota. Semua berkas .md biasa — bisa dibuka editor apa pun, dan aman disalin atau di-backup seperti folder lain.',
  'desktop.settings.moveVault': 'Pindah folder…',
  'desktop.settings.pickVault': 'Pilih folder vault',
  'desktop.settings.bridge': 'Jembatan extension',
  'desktop.settings.bridgeHint':
    'Extension mengirim rapat yang selesai ke vault ini lewat native messaging host-nya, kalau host-nya sudah didaftarkan dan togglenya dinyalakan di setelan extension. Pengiriman bersifat opsional — desktop tetap jalan tanpanya.',
  'desktop.settings.index': 'Indeks pencarian',
  'desktop.settings.indexHint':
    'Dibangun ulang dari berkas .md setiap kali daftar nota disegarkan. Indeks adalah turunan: menghapusnya tidak pernah menghilangkan nota.',

  // -- theme and language options -------------------------------------------
  'pref.system': 'Ikut sistem',
  'pref.light': 'Terang',
  'pref.dark': 'Gelap',
  'lang.en': 'Inggris',
  'lang.id': 'Indonesia',

  // -- extension: settings shell -------------------------------------------
  'ext.settings.title': 'Setelan',
  'ext.settings.sections': 'Bagian setelan',
  'ext.settings.close': 'Tutup setelan',
  'ext.settings.tab.provider': 'AI Provider',
  'ext.settings.tab.integrations': 'Integrasi',
  'ext.settings.tab.templates': 'Template',
  'ext.settings.tab.data': 'Data & MCP',
  'ext.settings.save': 'Simpan',
  'ext.settings.testConnection': 'Tes koneksi',
  'ext.settings.testing': 'Menguji…',

  // -- extension: language --------------------------------------------------
  'ext.settings.language': 'Bahasa',
  'ext.settings.languageHint':
    '“Ikut sistem” memakai bahasa browser. Ini hanya mengubah antarmuka — notulen rapat tetap memakai bahasa yang dipakai saat rapat.',

  // -- extension: provider panel -------------------------------------------
  'ext.provider.label': 'Provider',
  'ext.provider.builtinHint':
    'Tanpa konfigurasi — pakai AI bawaan browser (Gemini Nano) bila tersedia. Untuk hasil terbaik pilih provider cloud atau lokal di atas.',
  'ext.provider.apiKey': 'API Key',
  'ext.provider.apiKeyOptional': 'API Key (opsional)',
  'ext.provider.apiKeyPlaceholder': 'kosongkan jika endpoint tanpa auth',
  'ext.provider.apiKeyHintRequired': 'Dikirim sebagai {header} · disimpan terenkripsi (AES-GCM).',
  'ext.provider.apiKeyHintOptional':
    'Dikirim sebagai {header} bila diisi · disimpan terenkripsi (AES-GCM).',
  'ext.provider.baseUrl': 'Base URL',
  'ext.provider.azureHint': 'Endpoint resource Azure, model = nama deployment.',
  'ext.provider.model': 'Model',
  'ext.provider.modelPlaceholder': 'nama model / deployment',
  'ext.provider.loadModels': 'Muat model',
  'ext.provider.loadingModels': 'Memuat…',
  'ext.provider.modelsAvailable':
    '{count} model tersedia — klik kolom untuk memilih, atau ketik sendiri.',
  'ext.provider.modelsPrompt': 'Klik “Muat model” untuk mengambil daftar dari provider.',
  'ext.provider.retention': 'Simpan riwayat',
  'ext.provider.retentionForever': 'Selamanya (default)',
  'ext.provider.retentionDays': 'Hapus otomatis setelah {days} hari',
  'ext.provider.retentionHintForever': 'Tidak ada yang dihapus otomatis.',
  'ext.provider.retentionHintDays':
    'Meeting yang tidak aktif lebih dari {days} hari dihapus permanen — transcript, notulen, chat dan dokumen. Tidak bisa dibatalkan.',

  // -- extension: dashboard shell -------------------------------------------
  'ext.tab.summary': 'Ringkasan',
  'ext.tab.transcript': 'Transcript',
  'ext.tab.diagram': 'Diagram',
  'ext.tab.ask': 'Tanya',
  'ext.tab.docs': 'Dokumen',
  'ext.meeting.views': 'Tampilan meeting',
  'ext.meeting.nameLabel': 'Nama meeting',
  'ext.meeting.rename': '{id} — klik untuk ganti nama',
  'ext.meeting.transcriptLines': '{count} baris transcript',
  'ext.meeting.transcriptGeneric': 'transcript',
  'ext.meeting.confirmDelete':
    'Hapus “{label}”?\n\n{lines}, notulen, chat dan dokumen ikut terhapus permanen. Tindakan ini tidak bisa dibatalkan.',
  'ext.meeting.deleted': 'Meeting {label} dihapus.',
  'ext.empty.title': 'Belum ada meeting terekam.',
  'ext.empty.hint':
    'Join Google Meet — caption nyala otomatis, transcript dan notulen AI muncul di sini.',

  // -- extension: sidebar ---------------------------------------------------
  'ext.sidebar.theme': 'Tema: {mode}',
  'ext.sidebar.liveCount': '{count} meeting berlangsung',
  'ext.sidebar.searchAll': 'Cari semua rapat',
  'ext.sidebar.searchAllShortcut': 'Cari semua rapat (⌘K)',
  'ext.sidebar.knowledge': 'Knowledge base lintas rapat',
  'ext.sidebar.decisions': 'Keputusan & carry-over',
  'ext.sidebar.settings': 'Setelan',
  'ext.sidebar.project': 'Proyek',
  'ext.sidebar.projectFilter': 'Filter proyek',
  'ext.sidebar.allMeetings': 'Semua rapat',
  'ext.sidebar.live': 'Berlangsung',
  'ext.sidebar.history': 'Riwayat',
  'ext.sidebar.lines': '{count} baris',
  'ext.sidebar.deleteMeeting': 'Hapus meeting {label}',
  'ext.sidebar.deleteMeetingHint': 'Hapus meeting (transcript, notulen, chat)',
  'ext.sidebar.collapse': 'Lipat sidebar',
  'ext.sidebar.expand': 'Buka sidebar',

  // -- extension: meeting header -------------------------------------------
  'ext.header.agendaPlaceholder': 'Agenda rapat (opsional)',
  'ext.header.agenda': 'Agenda rapat',
  'ext.header.openActions': ' · {count} action item',
  'ext.header.openQuestions': ' · {count} pertanyaan',

  // -- extension: command palette ------------------------------------------
  'ext.palette.search': 'Cari semua rapat',
  'ext.palette.placeholder': 'Cari di semua rapat — keputusan, action item, kata di transcript…',
  'ext.palette.keywords': 'Kata kunci pencarian',
  'ext.palette.empty': 'Tidak ada hasil.',
  'ext.palette.keys': '↑↓ pilih · Enter buka · Esc tutup',
  'ext.kind.decision': 'Keputusan',
  'ext.kind.action': 'Action item',
  'ext.kind.question': 'Pertanyaan terbuka',
  'ext.kind.transcript': 'Transcript',
  'ext.kind.document': 'Dokumen',

  // -- extension: decision log ----------------------------------------------
  'ext.decisions.copied': 'Agenda carry-over disalin.',
  'ext.decisions.close': 'Tutup',
  'ext.decisions.heading': 'Keputusan — {count}',
  'ext.decisions.emptyTopic': 'Tidak ada keputusan pada topik ini.',
  'ext.decisions.empty': 'Belum ada keputusan terekam.',
  'ext.decisions.carryHeading': 'Bawa ke meeting berikutnya — {count}',
  'ext.decisions.noOpenQuestions': 'Tidak ada pertanyaan terbuka.',

  // -- extension: diagram ---------------------------------------------------
  'ext.diagram.copied': 'Sumber Mermaid disalin.',
  'ext.diagram.renderFailed': 'Diagram tidak bisa dirender: {message}',

  // -- extension: shared failures -------------------------------------------
  'ext.failed': 'Gagal: {error}',
  'ext.unknownError': 'tidak diketahui',

  // -- extension: diagram ---------------------------------------------------
  'ext.diagram.needSummary': 'Buat Ringkasan dulu',
  'ext.diagram.generating': 'Membuat…',
  'ext.diagram.regenerate': '↻ Buat ulang diagram',
  'ext.diagram.generate': '✨ Buat diagram',
  'ext.diagram.empty': 'Belum ada diagram.',
  'ext.diagram.hint':
    'Buat diagram alur dari rapat {id} bila membahas proses atau urutan langkah. On-demand — pakai transcript rapi bila sudah dirapikan.',
  'ext.diagram.hintNoSummary': 'Buat Ringkasan dulu, lalu diagram bisa dibuat dari sini.',

  // -- extension: documents -------------------------------------------------
  'ext.docs.kinds': 'Jenis dokumen',
  'ext.docs.generating': 'sedang dibuat',
  'ext.docs.generated': 'sudah dibuat',
  'ext.docs.template': 'Template dokumen',
  'ext.docs.done': '{label} selesai dibuat.',
  'ext.docs.pdfDownloaded': 'PDF diunduh.',
  'ext.docs.pdfFailed': 'Gagal membuat PDF: {error}',
  'ext.docs.markdownCopied': 'Markdown disalin.',
  'ext.docs.progress':
    'AI menyusun {label} ({stage})… {pct}% · draft → periksa → revisi. Hasil muncul otomatis.',
  'ext.docs.meta': '{label} · dibuat {date}',
  'ext.docs.empty': 'Belum ada {label}.',
  'ext.docs.stalled': 'Proses {label} sebelumnya terhenti. Klik untuk mengulang.',
  'ext.docs.hint':
    'Buat draft {label} dari transcript rapat {id} (draft → periksa → revisi). Draft ini titik mulai — tinjau sebelum dipakai.',

  // -- extension: transcript ------------------------------------------------
  'ext.transcript.versions': 'Versi transcript',
  'ext.transcript.cleaned': 'Transcript dirapikan — {count} baris dikoreksi.',
  'ext.transcript.copied': 'Transcript disalin.',
  'ext.transcript.redoHint': 'Abaikan hasil lama, rapikan ulang dari awal',
  'ext.transcript.waitForEnd': 'Tunggu rapat selesai',
  'ext.transcript.cleanHint': 'Perbaiki salah-dengar (angka, nama, istilah) dengan AI',
  'ext.transcript.recleanBtn': '✨ Rapikan ulang',
  'ext.transcript.speakingShare': 'Porsi bicara',
  'ext.transcript.detectedActions': 'Action terdeteksi',
  'ext.transcript.waitingForSpeech': 'Menunggu ada yang bicara…',
  'ext.transcript.cleanNote':
    'Versi rapi — {count} baris dikoreksi · {date}. Verifikasi bila ragu.',
  'ext.transcript.renameSpeaker': 'Ganti nama pembicara ini di seluruh rapat',
  'ext.transcript.captured': 'Yang tertangkap caption',
  'ext.transcript.useAi': '↺ Pakai versi AI',
  'ext.transcript.useOriginal': 'Pakai versi asli',
  'ext.transcript.renamed': '{count} baris kini atas nama {name}.',
  'ext.kind.deadline': 'Deadline',
  'ext.kind.risk': 'Risiko',

  // -- extension: summary ---------------------------------------------------
  'ext.summary.checklistCopied': 'Checklist disalin.',
  'ext.summary.noDatedActions': 'Tidak ada action item dengan tanggal terstruktur (yyyy-mm-dd)',
  'ext.summary.icsDownloaded': '{count} event kalender diunduh.',
  'ext.summary.section.timeline': 'Timeline pembahasan',
  'ext.summary.momDone': 'MoM sementara dibuat.',
  'ext.summary.notesDone': 'Notulen selesai dibuat.',
  'ext.summary.markdownDownloaded': 'Markdown diunduh.',
  'ext.summary.obsidianDownloaded': 'Catatan Obsidian diunduh (folder Meetings/).',
  'ext.summary.processing': 'Memproses…',
  'ext.summary.restart': '↻ Mulai ulang',
  'ext.summary.retry': 'Coba lagi',
  'ext.summary.analysisFailed': 'Analisis gagal',
  'ext.summary.liveTitle': 'Meeting masih berlangsung.',
  'ext.summary.emptyTitle': 'Belum ada notulen.',
  'ext.summary.liveHint':
    'Notulen dibuat otomatis begitu meeting selesai — atau buat MoM sementara sekarang dari transcript sejauh ini.',
  'ext.summary.emptyHint': 'Jalankan analisis AI untuk ringkasan, keputusan, dan action item.',
  'ext.summary.makeMom': 'Buat MoM sekarang',
  'ext.summary.generate': 'Generate sekarang',

  // -- extension: ask -------------------------------------------------------
  'ext.ask.suggest1': 'Apa keputusan utama rapat ini?',
  'ext.ask.suggest2': 'Siapa yang bertanggung jawab atas action item?',
  'ext.ask.suggest3': 'Adakah deadline yang disebut?',
  'ext.ask.suggest4': 'Apa yang belum terjawab di rapat ini?',
  'ext.ask.grade.explicit': 'Disebut langsung',
  'ext.ask.grade.partial': 'Belum tuntas dibahas',
  'ext.ask.grade.inferred': 'Simpulan dari pembahasan',
  'ext.ask.grade.notFound': 'Tidak dibahas',
  'ext.ask.undecided': 'Belum diputuskan',
  'ext.ask.evidence': 'Bukti dari transcript',
  'ext.ask.cleared': 'Riwayat tanya-jawab dihapus.',
  'ext.ask.hint': 'Tanya apa saja tentang rapat ini — dijawab dari transcript.',
  'ext.ask.empty': 'Tanya ke transcript.',
  'ext.ask.placeholderLive': 'Rapat masih berlangsung — tetap bisa ditanya',
  'ext.ask.placeholder': 'Tulis pertanyaan…',
  'ext.ask.question': 'Pertanyaan',
  'ext.ask.send': 'Kirim',
  'ext.confidence.high': 'tinggi',
  'ext.confidence.medium': 'sedang',
  'ext.confidence.low': 'rendah',

  // -- extension: knowledge base --------------------------------------------
  'ext.kb.pushToTracker': 'Kirim ke issue tracker',
  'ext.kb.alreadyPushed': 'Sudah pernah dikirim: {ref}',
  'ext.kb.created': 'Dibuat: {ref}',
  'ext.kb.askPlaceholder':
    'Tanya lintas rapat — mis. apa keputusan terkait migrasi 3 bulan terakhir?',
  'ext.kb.askLabel': 'Pertanyaan lintas rapat',
  'ext.kb.ask': 'Tanya',
  'ext.kb.copyDigest': 'Salin ringkasan 7 hari terakhir sebagai markdown',
  'ext.kb.digestCopied': 'Digest mingguan disalin.',
  'ext.kb.overdue': '· {count} lewat due',
  'ext.kb.checkingTracker': 'Cek tracker…',
  'ext.kb.pullTracker': 'Tarik status tracker',
  'ext.kb.noOpenActions': 'Tidak ada action item terbuka.',
  'ext.kb.changedDecisions': 'Keputusan yang berubah',
  'ext.kb.noRepeatedTopics': 'Belum ada topik yang diputuskan lebih dari sekali.',
  'ext.kb.noAnalysed': 'Belum ada rapat yang dianalisis.',
  'ext.kb.noOwner': 'tanpa owner',
  'ext.kind.questionResolved': 'Terjawab',

  // -- extension: sign-in ---------------------------------------------------
  'ext.signin.permissionDenied': 'Izin akses ditolak — sign-in tidak bisa jalan.',
  'ext.signin.requestingCode': 'Meminta kode…',
  'ext.signin.waitingApproval': 'Menunggu persetujuan di browser…',
  'ext.signin.exchangingCode': 'Menukar kode…',
  'ext.signin.preparingProject': 'Menyiapkan project Code Assist…',
  'ext.signin.codeExpired': 'Kode kedaluwarsa sebelum disetujui. Coba lagi.',
  'ext.signin.startWithGoogle': 'Mulai dari tombol “Masuk dengan Google” dulu.',
  'ext.signin.chatgptConnected': 'ChatGPT tersambung.',
  'ext.signin.googleConnected': 'Google tersambung.',
  'ext.signin.disconnected': 'Akun diputus.',
  'ext.signin.withChatgpt': 'Masuk dengan ChatGPT',
  'ext.signin.finish': 'Selesaikan sign-in',
  'ext.signin.enterCode': 'Masukkan kode {code} di tab yang terbuka',

  'ext.ask.emptyHint':
    'Jawaban diambil dari isi rapat {id} dan disertai bukti (timestamp / pembicara).',

  // -- desktop: updater -----------------------------------------------------
  'desktop.update.available': 'Versi {version} tersedia.',
};
