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

  // -- desktop: updater -----------------------------------------------------
  'desktop.update.available': 'Versi {version} tersedia.',
};
