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

  'ext.ask.emptyHint':
    'Jawaban diambil dari isi rapat {id} dan disertai bukti (timestamp / pembicara).',

  // -- extension: integrations ---------------------------------------------
  'ext.integrations.liveHighlights': 'Sorotan langsung saat rapat berjalan',
  'ext.integrations.liveHighlightsHint':
    'Deteksi keputusan / action / deadline dari kata kuncinya saja — tanpa panggilan AI, jadi tidak menambah biaya dan tidak mengirim apa pun keluar.',
  'ext.integrations.bridge': 'Kirim rapat selesai ke Companion Desktop',
  'ext.integrations.bridgeHint':
    'Menulis nota rapat ke vault lokal Companion Desktop lewat native messaging host-nya — tetap di komputer ini, tidak lewat jaringan. Butuh Companion Desktop terpasang; kalau belum, extension tetap jalan normal dan pengiriman dicoba lagi nanti.',
  'ext.bridge.test': 'Tes koneksi',
  'ext.bridge.testing': 'Menguji…',
  'ext.bridge.connected': 'Terhubung ke Companion Desktop.',
  'ext.bridge.notConnected': 'Belum terhubung.',
  'ext.bridge.fixHint':
    '{detail} — jalankan {command} sekali lagi untuk mendaftarkan host-nya ke profil browser ini, lalu muat ulang extension.',
  'ext.tracker.legend': 'Issue tracker (action item)',
  'ext.tracker.provider': 'Provider',
  'ext.tracker.baseUrl': 'Base URL',
  'ext.tracker.token': 'Token',
  'ext.tracker.projectKey': 'Project key',
  'ext.tracker.teamId': 'Team id',
  'ext.tracker.databaseId': 'Database id',
  'ext.sync.legend': 'Sync & workspace tim',
  'ext.sync.enable': 'Aktifkan sync',
  'ext.sync.enableHint':
    'Opsional. Isi transcript dienkripsi dengan passphrase kamu sebelum dikirim — server tidak pernah menerima kuncinya. Tidak ada layanan Companion: jalankan {server} di komputer sendiri, atau pakai endpoint https milikmu.',
  'ext.sync.endpoint': 'Endpoint',
  'ext.sync.token': 'Token',
  'ext.sync.workspace': 'Workspace id (opsional)',
  'ext.sync.workspaceHint': 'Namespace bersama untuk satu tim; kosong = pribadi.',
  'ext.sync.passphrase': 'Passphrase enkripsi',
  'ext.sync.passphraseHint':
    'Minimal 8 karakter. Kalau hilang, data yang sudah terkirim tidak bisa dibuka lagi — tidak ada pemulihan.',
  'ext.sync.now': 'Sync sekarang',
  'ext.sync.syncing': 'Sync…',
  'ext.sync.saveFirst': 'Simpan dulu bila baru mengubah pengaturan di atas.',
  'ext.sync.result': 'Sync: {pushed} terkirim, {pulled} diterima',
  'ext.sync.failedSuffix': ', {count} gagal ({error})',
  'ext.transcription.legend': 'Transkripsi rekaman & kalender',
  'ext.transcription.endpoint': 'Endpoint speech-to-text',
  'ext.transcription.endpointHint':
    'Kompatibel OpenAI (termasuk Whisper lokal). Kosong = impor file audio dimatikan.',
  'ext.templates.saved': 'Template tersimpan.',
  'ext.templates.intro':
    'Template mengatur struktur dan penekanan dokumen (mis. notulen retro, MoM klien). Aturan grounding tetap berlaku: template mengubah bentuk, bukan mengizinkan fakta baru.',
  'ext.templates.delete': 'Hapus',
  'ext.data.importMeeting': 'Impor rapat',
  'ext.data.transcriptOrAudio': 'Berkas transcript atau audio',
  'ext.data.pickFile': 'Pilih berkas dulu.',
  'ext.data.imported': '{count} baris diimpor sebagai {id}.',
  'ext.data.calendar': 'Kalender (.ics)',
  'ext.data.calendarFile': 'Berkas kalender',
  'ext.data.pickIcs': 'Pilih berkas .ics dulu.',
  'ext.data.matched': '{count} rapat dicocokkan dengan agenda kalender.',
  'ext.data.matching': 'Mencocokkan…',
  'ext.data.match': 'Cocokkan agenda',
  'ext.data.share': 'Bagikan rapat (terenkripsi)',
  'ext.data.passphrase': 'Passphrase',
  'ext.data.pickMeetingFirst': 'Pilih rapat dulu di sidebar',
  'ext.data.shareDownloaded': 'Berkas share diunduh.',
  'ext.data.shareFile': 'Berkas share',
  'ext.data.pickShareFirst': 'Pilih berkas share dulu.',
  'ext.data.shareImported': 'Rapat {id} diimpor.',
  'ext.data.backup': 'Cadangan',

  'ext.calendar.clientIdHint':
    'Client id milikmu sendiri; extension ini tidak membawa kredensial apa pun. Tanpa ini, pencocokan kalender tetap bisa lewat impor file .ics di tab Data.',
  'ext.calendar.connect': 'Hubungkan Google Calendar',
  'ext.calendar.saveFirst': 'Simpan setelan dulu agar client id terbaca.',
  'ext.templates.usedFor': 'Dipakai untuk',
  'ext.templates.kindDoc': 'Dokumen (BRD / PRD / Notulen)',
  'ext.templates.kindAnalysis': 'Analisis rapat',
  'ext.templates.instructions': 'Instruksi',
  'ext.templates.instructionsPlaceholder':
    'Fokus pada apa yang berjalan baik, apa yang tidak, dan eksperimen sprint berikutnya.',
  'ext.templates.sections': 'Section (satu per baris, opsional)',
  'ext.data.importHint':
    'Berkas .vtt, .srt, transcript Zoom, atau teks biasa. Rekaman audio/video ikut didukung bila endpoint speech-to-text sudah diisi di tab Integrasi (maks 25 MB). Hasilnya jadi rapat biasa: bisa dianalisis, dicari, dan ditanyai seperti rapat yang direkam langsung.',
  'ext.data.sharePassphraseHint':
    'Penerima butuh passphrase ini untuk membuka berkas. Siapa pun yang punya passphrase-nya bisa membaca isi rapat.',
  'ext.data.exportSelected': 'Ekspor rapat terpilih',
  'ext.data.backupNot': 'tidak',
  'ext.data.backupHint': 'Semua rapat dalam satu berkas: transkrip, notulen, chat dan dokumen. API key, token dan log audit {not} ikut — itulah yang membuat berkas ini aman disimpan, dan sebabnya kamu perlu memasang ulang provider AI setelah memulihkan.',
  'ext.data.restoreHint':
    'Memulihkan bersifat menambah: rapat yang sudah ada di profil ini tidak ditimpa, jadi memulihkan berkas yang sama dua kali tidak mengubah apa pun.',
  'ext.data.backupDownloaded': 'Cadangan {count} rapat diunduh.',
  'ext.data.downloadBackup': 'Unduh cadangan',
  'ext.data.backupFile': 'Berkas cadangan',
  'ext.data.pickBackupFirst': 'Pilih berkas cadangan dulu.',
  'ext.data.restored': 'Dipulihkan: {added} entri baru dari {meetings} rapat',
  'ext.data.restoredSkipped': ', {count} sudah ada',
  'ext.data.restoredNothing': 'Semua isi cadangan sudah ada di profil ini.',
  'ext.data.restore': 'Pulihkan dari cadangan',
  'ext.mcp.legend': 'MCP & indeks',
  'ext.mcp.hint': 'Snapshot untuk MCP server ({command}) agar coding agent bisa membaca rapatmu.',
  'ext.mcp.snapshotDownloaded': 'Snapshot diunduh.',
  'ext.mcp.exportSnapshot': 'Ekspor snapshot',
  'ext.mcp.reindexed': 'Indeks dibangun ulang: {sessions} rapat, {entries} baris',
  'ext.mcp.rebuildIndex': 'Bangun ulang indeks',
  'ext.export.legend': 'Ekspor Obsidian & log audit',
  'ext.export.hint':
    'Vault .zip berisi satu catatan Markdown per rapat yang sudah dianalisis — siap dibuka di Obsidian. Log audit diekspor sebagai JSON dan tidak pernah meninggalkan komputer ini.',
  'ext.export.exporting': 'Mengekspor…',
  'ext.export.obsidian': 'Ekspor ke Obsidian (.zip)',
  'ext.export.obsidianDone': '{count} catatan rapat diekspor ke {name}.',
  'ext.export.auditDone': '{count} event audit diunduh (JSON).',

  'ext.templates.empty': 'Belum ada template.',

  'ext.mcp.mismatched': ', {count} tidak cocok',

  // -- extension: worker errors ---------------------------------------------
  'ext.err.rateLimited': 'Terlalu banyak permintaan AI — tunggu sebentar lalu coba lagi.',
  'ext.err.analysisRateLimited': 'Rate limit: terlalu banyak analisis, coba lagi nanti.',
  'ext.err.invalidRoomId': 'roomId tidak valid',
  'ext.err.nothingToExport': 'Belum ada meeting dengan ringkasan yang bisa diekspor.',
  'ext.err.actionNotFound': 'Action item tidak ditemukan.',
  'ext.err.syncDisabled': 'Sync belum diaktifkan di Setelan.',
  'ext.err.audioTooLarge': 'Berkas audio lebih dari 25 MB — potong dulu atau pakai transcript teks.',
  'ext.err.emptyTranscription': 'Transkripsi mengembalikan teks kosong.',
  'ext.err.noTranscriptLines': 'Tidak ada baris transcript yang bisa dibaca dari berkas itu.',
  'ext.err.emptyName': 'Nama baru tidak boleh kosong.',
  'ext.err.noCalendarClientId': 'Isi Google OAuth client id di Setelan dulu.',
  'ext.err.noAccessToken': 'Google tidak mengembalikan access token.',
  'ext.err.noCanvas': 'Canvas 2D context tidak tersedia',

  // -- extension: remaining ------------------------------------------------
  'ext.err.meetingNotFound': 'Meeting tidak ditemukan.',
  'ext.err.summaryFirst': 'Buat Ringkasan dulu sebelum diagram.',
  'ext.err.unknownDbOp': 'Operasi database tidak dikenal: {op}',
  'ext.err.dbNoResponse': 'Database tidak merespons.',
  'ext.err.svgRenderFailed': 'Gagal merender SVG ke gambar',
  'ext.header.carryOpen': '{count} hal dari rapat sebelumnya masih terbuka',
  'ext.header.openPrevious': 'buka rapat sebelumnya',
  'ext.palette.askAi': 'Tanya AI tentang hasil ini',
  'ext.provider.modelsFailed': 'Daftar model tidak bisa diambil ({error}) — ketik manual.',
  'ext.settings.permissionFailed': 'Gagal meminta izin: {error}',
  'ext.settings.retentionWarning':
    'Meeting yang tidak aktif lebih dari {days} hari akan dihapus permanen, termasuk transcript dan notulennya. Lanjutkan?',
  'ext.transcript.noOwner': 'PIC belum disebut',
  'ext.transcript.keywordGuess':
    'Dugaan dari kata kunci — daftar final dibuat AI setelah rapat selesai.',
  'ext.kb.showDone': 'Tampilkan yang selesai',
  'ext.diagram.nothingToDraw': 'Tidak ada alur/proses yang bisa didiagramkan.',
  'ext.signin.account': 'Akun',
  'ext.signin.accountHint':
    'Pakai langganan yang sudah kamu bayar, tanpa API key. Jalur ini memakai backend yang dipakai klien resmi vendor (Codex CLI / Gemini CLI) dan bukan API publik yang didokumentasikan — bisa berubah sewaktu-waktu. Butuh yang stabil? Pilih provider API key di atas.',
  'ext.signin.withGoogle': 'Masuk dengan Google',
  'ext.signin.googleHint':
    'Setelah menyetujui, browser mendarat di alamat {address} yang tidak memuat apa pun — itu normal. Salin seluruh isi address bar ke sini.',
  'ext.signin.deviceCode': 'Masukkan kode {code} di tab yang terbuka ({url}), lalu setujui.',
  'desktop.update.failed':
    'Gagal memasang pembaruan. Coba lagi, atau unduh manual dari halaman rilis.',
  'desktop.update.installing': 'Memasang…',
  'desktop.update.retry': 'Coba lagi',
  'desktop.update.restart': 'Restart & pasang',

  'ext.ask.advise': 'Analisis Companion, di luar isi rapat',
  'ext.transcript.newSinceFull':
    '+{count} baris baru sejak dirapikan (belum dikoreksi). Klik “{button}” untuk merapikan semuanya.',

  // -- packages: AI ---------------------------------------------------------
  'pkg.ai.badJson': 'JSON dari AI tidak valid',
  'pkg.ai.emptyAnswer': 'Jawaban kosong dari AI',
  'pkg.ai.emptyQuestion': 'Pertanyaan kosong',
  'pkg.ai.emptySummary': 'executiveSummary kosong',
  'pkg.ai.emptyMerged': 'Ringkasan gabungan kosong',
  'pkg.ai.emptyResponse': 'Respons AI kosong',
  'pkg.ai.emptyDraft': 'Draft dokumen kosong',
  'pkg.ai.noBuiltin':
    'AI bawaan browser tidak tersedia di browser ini. Pilih provider di Setelan.',

  // -- packages: OAuth ------------------------------------------------------
  'pkg.oauth.noJson': 'Auth service tidak mengembalikan JSON',
  'pkg.oauth.noAccessToken': 'Respons tidak memuat access token',
  'pkg.oauth.noDeviceCode': 'Respons tidak memuat device code',
  'pkg.oauth.noAuthCode': 'Persetujuan tidak memuat authorization code',
  'pkg.oauth.stateMismatch': 'URL itu milik proses sign-in yang lain. Ulangi.',
  'pkg.oauth.noCodeInUrl': 'URL itu tidak memuat authorization code.',
  'pkg.oauth.noProject':
    'Code Assist tidak membuatkannya. Isi Project ID di bawah lalu masuk lagi.',
  'pkg.oauth.needProject': 'Isi Project ID Google Cloud di bawah lalu masuk lagi.',
  'pkg.oauth.onboardTimeout': 'Onboarding tidak selesai. Coba masuk lagi.',

  // -- packages: meeting ----------------------------------------------------
  'pkg.meeting.noTranscriptionEndpoint': 'Endpoint transkripsi belum diisi di Setelan.',
  'pkg.meeting.invalidBundle': 'Bundle rapat tidak valid.',
  'pkg.meeting.notFound': 'Meeting tidak ditemukan.',
  'pkg.meeting.emptyTranscript': 'Transcript masih kosong.',
  'pkg.meeting.notifyReady': 'Notulen siap ✓',
  'pkg.meeting.notifyReadyBody': 'Meeting {id} selesai dianalisis.',
  'pkg.meeting.notifyFailed': 'Analisis gagal',
  'pkg.tracker.noToken': 'Token integrasi belum diisi.',
  'pkg.tracker.noTarget': 'Project / team / database id belum diisi.',
  'pkg.tracker.jiraTokenFormat': 'Token Jira harus berformat email:api-token.',

  // -- packages: shared -----------------------------------------------------
  'pkg.backup.unrecognised': 'Berkas cadangan tidak dikenali.',
  'pkg.backup.empty': 'Cadangan tidak berisi data.',
  'pkg.crypto.emptyPassphrase': 'Passphrase kosong.',
  'pkg.crypto.unknownFormat': 'Format terenkripsi tidak dikenal.',

  // -- packages: exporters --------------------------------------------------
  'pkg.export.transcriptLines': '- **Jumlah baris transcript**: {count}',
  'pkg.export.participants': 'Peserta:',
  'pkg.export.lines': '{count} baris',
  'pkg.export.noActionItems': '- [ ] (tidak ada action item)',

  'pkg.issue.source': 'Sumber: rapat {where}',
  'pkg.issue.owner': 'Owner (dari rapat): {owner}',
  'pkg.issue.due': 'Due (dari rapat): {due}',
  'pkg.issue.footer': 'Dibuat otomatis oleh Companion.',
  'pkg.docgen.footer':
    '_Dokumen draft dibuat oleh Meet Companion AI — powered by suiflex. Tinjau sebelum digunakan._',

  'pkg.ask.noRelevantPart': 'Tidak ada bagian rapat yang membahas hal ini.',
  'pkg.ask.noRelevantMeeting': 'Tidak ada rapat tersimpan yang membahas hal ini.',
  'pkg.agenda.noOpenQuestions': '_Tidak ada pertanyaan terbuka yang tersisa._',
  'pkg.digest.noActivity': '_Tidak ada aktivitas rapat pada periode ini._',

  'ext.kb.actionItems': 'Action item',

  'pkg.docgen.stage.context': 'Menyiapkan konteks',
  'pkg.docgen.stage.draft': 'Menulis draft',
  'pkg.docgen.stage.review': 'Memeriksa & memvalidasi',
  'pkg.docgen.stage.done': 'Selesai',
  'pkg.oauth.notAUrl': 'Itu bukan URL. Salin seluruh isi address bar.',

  'desktop.meeting.participants': 'Peserta',
  'desktop.meeting.showTranscript': 'Lihat transkrip',
  'desktop.meeting.hideTranscript': 'Sembunyikan transkrip',
  'desktop.meeting.loadingTranscript': 'Membaca transkrip…',
  'desktop.meeting.emptyTranscript': 'Berkas transkripnya kosong.',
  'desktop.meeting.openInExtension': 'Buka di extension',
  'desktop.meeting.copyLink': 'Salin tautan',

  'desktop.settings.resetVault': 'Kembali ke default',
  'desktop.settings.moveHere': 'Pindahkan vault ke sini',
  'desktop.settings.confirmReset':
    'Kembali ke vault default di ~/Companion? Tidak ada isi folder sekarang yang dihapus.',
  'desktop.settings.confirmExistingVault':
    'Pakai vault Companion di {path}? Nota di sana akan muncul di sini; tidak ada yang dipindah atau dihapus.',
  'desktop.settings.confirmForeignFolder':
    '{path} bukan vault Companion dan berisi {count} berkas markdown — semuanya akan terdaftar sebagai nota. Companion akan membuat folder .transcript di dalamnya. Lanjutkan?',
  'desktop.settings.confirmEmptyFolder':
    'Pakai {path} sebagai vault? Companion akan membuat folder .transcript di dalamnya. Isi vault-mu sekarang tidak dipindah atau dihapus.',
  'desktop.settings.cancel': 'Batal',

  'desktop.editor.blockPlaceholder': "Ketik '/' untuk perintah",

  'desktop.toast.saved': 'Nota tersimpan.',
  'desktop.toast.trashed': 'Dipindahkan ke sampah.',
  'desktop.toast.vaultMoved': 'Vault sekarang di {path}.',
  'desktop.toast.linkCopied': 'Tautan tersalin.',
  'desktop.toast.copyFailed': 'Gagal menyalin — seleksi kolomnya lalu salin manual.',

  'desktop.field.addProperty': 'Tambah properti',
  'desktop.field.hideEmpty': 'Sembunyikan properti kosong',

  'sponsor.title': 'Dukung Companion',
  'sponsor.github': 'GitHub Sponsors',
  'sponsor.saweria': 'Saweria',

  'desktop.vault.newFolder': 'Folder baru',
  'desktop.vault.folderName': 'Nama folder',
  'desktop.vault.newFolderIn': 'Folder baru di {folder}',
  'desktop.vault.folderNameIn': 'Nama folder, di dalam {folder}',
  'desktop.vault.folderCreated': 'Folder {name} dibuat.',
  'desktop.vault.moveTo': 'Pindahkan ke…',
  'desktop.vault.saveTo': 'Simpan ke…',
  'desktop.vault.moved': 'Dipindahkan ke {folder}.',
  'desktop.vault.rootFolder': 'Akar vault',

  'desktop.vault.duplicateSessionKey':
    '{path} memakai session key yang sama dengan nota lain, jadi tidak masuk pencarian.',
  'desktop.vault.duplicateSessionKeys':
    '{count} nota memakai session key yang sama dengan nota lain dan tidak masuk pencarian, salah satunya {path}.',

  // -- desktop: updater -----------------------------------------------------
  'desktop.update.available': 'Versi {version} tersedia.',
};
