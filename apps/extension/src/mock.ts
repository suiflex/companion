/**
 * Standalone dev mock for localhost preview (Vite dev server).
 *
 * Automatically polyfills `window.chrome` APIs when running outside an extension
 * context (e.g., http://localhost:5173). Persists to `localStorage` and seeds
 * sample meeting data with transcript, summary, action items, and diagram so UI
 * components can be previewed and styled with instant HMR.
 */

import type { AnalysisRecord, Diagram, Entry, MeetingMeta } from '@meetcc/shared';

const STORAGE_KEY = 'meetcc_dev_storage';

interface MockSeed {
  id: string;
  title: string;
  context: string;
  minutesAgo: number;
  durationMins: number;
  dialogue: { speaker: string; text: string }[];
  summary: string;
  timeline: { time: string; topic: string }[];
  decisions: { what: string; why: string; rejected: string[]; topic: string }[];
  actionItems: { task: string; owner: string; due: string }[];
  diagram?: Diagram;
}

const MOCK_SEEDS: MockSeed[] = [
  {
    id: 'meet/arch-sync-2026',
    title: 'Q3 System Architecture & Performance Review',
    context:
      'Quarterly architecture sync reviewing API Gateway latency bottlenecks, database read replicas, and caching strategies.',
    minutesAgo: 35,
    durationMins: 30,
    dialogue: [
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Halo tim, terima kasih sudah hadir. Hari ini kita fokus bahas evaluasi lonjakan latensi di API Gateway saat peak hours kemarin.',
      },
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Dari pantauan metrik, P95 latency naik sampai 450ms karena connection pool ke database utama overload pas traffic spike.',
      },
      {
        speaker: 'Budi Santoso (DevOps)',
        text: 'Betul, pas dicek ternyata query baca laporan analitik masih diarahkan ke primary DB alih-alih read replica.',
      },
      {
        speaker: 'Maya Lin (Product)',
        text: 'Dampaknya kemarin beberapa user sempat checkout timeout sekitar 2-3 menit ya?',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Iya Maya. Solusi jangka pendek kita pisahkan query read/write di level ORM dan pasang Redis caching buat token auth.',
      },
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Siap, bagian read-write splitting di repository layer bisa saya handle target selesai Jumat ini.',
      },
      {
        speaker: 'Budi Santoso (DevOps)',
        text: 'Untuk Redis cluster dan dashboard monitoring di Grafana saya setup sebelum Rabu besok.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Mantap. Sebelum rilis production Selasa depan, kita load test dulu di staging ya.',
      },
    ],
    summary:
      'Tim mengevaluasi lonjakan latensi P95 di API Gateway akibat bottleneck database utama saat jam sibuk. Disepakati implementasi pemisahan read/write replica pada DataSource layer serta caching token otentikasi di Redis cluster.',
    timeline: [
      { time: '14:00', topic: 'Evaluasi lonjakan latensi API Gateway saat peak hours' },
      { time: '14:10', topic: 'Investigasi database connection pool & pemakaian read replica' },
      { time: '14:20', topic: 'Keputusan arsitektur: Read/Write Splitting & Redis Session Cache' },
      { time: '14:30', topic: 'Action item dan jadwal pengujian staging' },
    ],
    decisions: [
      {
        what: 'Implementasi Read/Write Splitting di DataSource layer',
        why: 'Menghilangkan beban query baca berat dari database utama agar latensi kembali < 100ms',
        rejected: ['Vertical scaling DB utama (biaya tinggi dan tidak menyelesaikan akar masalah)'],
        topic: 'Database Architecture',
      },
      {
        what: 'Redis Caching untuk validasi token sesi auth',
        why: 'Memangkas 60% pemanggilan query auth berulang ke database',
        rejected: ['In-memory local cache per instance (isu inkonsistensi saat rolling deployment)'],
        topic: 'Gateway Caching',
      },
    ],
    actionItems: [
      { task: 'Konfigurasi routing read replica di repository backend', owner: 'Alex Rivera', due: 'Jumat, 2 Okt 2026' },
      { task: 'Setup Redis cluster & alert monitoring di Grafana', owner: 'Budi Santoso', due: 'Rabu, 30 Sep 2026' },
      { task: 'Eksekusi end-to-end load testing di staging', owner: 'Sarah Chen', due: 'Senin, 5 Okt 2026' },
    ],
    diagram: {
      title: 'Arsitektur Read/Write Splitting & Caching',
      type: 'flowchart',
      mermaid:
        'graph TD\n  Client[API Client] --> Gateway[API Gateway]\n  Gateway --> Auth[Redis Session Cache]\n  Gateway --> Service[Backend Service]\n  Service -->|Writes| Primary[(Primary DB)]\n  Service -->|Reads| Replica[(Read Replica)]',
    },
  },
  {
    id: 'meet/product-ui-revamp',
    title: 'Product UI/UX Revamp & Standalone Mode',
    context: 'Kickoff perombakan desain UI Companion dan eksplorasi localhost standalone preview.',
    minutesAgo: 120,
    durationMins: 40,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Halo semua, sesi ini kita mulai kick off perombakan tampilan dashboard extension biar lebih bersih dan modern.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Bagus banget, kita sekalian siapin standalone dev mode biar tim frontend bisa styling langsung di localhost tanpa perlu bikin zip ekstensi.',
      },
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Setuju, integrasi HMR bikin iterasi styling tombol, tabs, dan layout jauh lebih cepet.',
      },
    ],
    summary:
      'Kickoff inisiatif redesain UI extension Companion dan implementasi standalone development mock di localhost.',
    timeline: [
      { time: '10:00', topic: 'Review feedback desain UI lama' },
      { time: '10:25', topic: 'Rencana implementasi standalone preview mode' },
    ],
    decisions: [
      {
        what: 'Penggunaan standalone dev mock untuk localhost:5173',
        why: 'Mencegah kebutuhan reload manual atau build zip berulang kali saat utak-atik styling',
        rejected: ['Hanya mengandalkan manual chrome extension reload'],
        topic: 'Developer Experience',
      },
    ],
    actionItems: [
      { task: 'Buat mock polyfill chrome.storage di browser', owner: 'Frontend Team', due: 'Hari ini' },
    ],
  },
  {
    id: 'teams/daily-standup-sprint-42',
    title: 'Daily Standup: Sprint 42 Kickoff',
    context: 'Sinkronisasi harian tim rekayasa perangkat lunak untuk Sprint 42.',
    minutesAgo: 240,
    durationMins: 20,
    dialogue: [
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Hari ini fokus selesaikan connection pool refactor dan review PR cache.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Saya koordinasi unblock billing webhook dengan tim platform.',
      },
      {
        speaker: 'Maya Lin (Product)',
        text: 'Target kita sprint demo v1.16 tetap hari Jumat ya.',
      },
    ],
    summary:
      'Daily standup Sprint 42 membahas progress PR session caching, unblocking billing webhook, serta kesiapan demo v1.16.',
    timeline: [
      { time: '09:00', topic: 'Round-robin updates sprint progress' },
      { time: '09:15', topic: 'Blocker identification & demo target' },
    ],
    decisions: [],
    actionItems: [
      { task: 'Merge PR session caching', owner: 'Alex Rivera', due: 'Hari ini' },
    ],
  },
  {
    id: 'meet/security-audit-q3',
    title: 'Cloud Infrastructure & ISO 27001 Security Audit',
    context: 'Audit kepatuhan keamanan dan evaluasi kerentanan cloud AWS.',
    minutesAgo: 1080,
    durationMins: 60,
    dialogue: [
      {
        speaker: 'Budi Santoso (DevOps)',
        text: 'Scanning kerentanan rutin sudah nol high CVE setelah patch dependensi minggu lalu.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Pastikan bukti enkripsi at-rest dan log rotasi kunci KMS sudah siap diexport untuk auditor.',
      },
    ],
    summary:
      'Review kesiapan audit keamanan ISO 27001 dan verifikasi kepatuhan enkripsi data at-rest pada vault storage.',
    timeline: [
      { time: '15:30', topic: 'Review vulnerability scan results' },
      { time: '16:00', topic: 'Verifikasi KMS encryption key rotation' },
    ],
    decisions: [
      {
        what: 'Otomatisasi audit evidence collection mingguan',
        why: 'Menghemat waktu rekap manual saat audit tahunan',
        rejected: ['Pencatatan spreadsheet manual'],
        topic: 'Security Compliance',
      },
    ],
    actionItems: [
      { task: 'Export laporan rotasi IAM credentials ke audit folder', owner: 'Budi Santoso', due: '3 Okt 2026' },
    ],
  },
  {
    id: 'meet/customer-discovery-fintech',
    title: 'Customer Discovery: Enterprise FinTech Integration',
    context: 'Wawancara kebutuhan integrasi perbankan enterprise untuk privasi data rapat.',
    minutesAgo: 1440,
    durationMins: 45,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Partner FinTech butuh jaminan data rapat tidak pernah bocor ke cloud tanpa izin eksplisit.',
      },
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Arsitektur local-first kita di mana data meeting murni di browser dan desktop vault sangat cocok buat mereka.',
      },
    ],
    summary:
      'Wawancara kebutuhan enterprise FinTech terkait isolasi data meeting lokal dan kepatuhan regulasi perbankan.',
    timeline: [
      { time: '13:00', topic: 'Presentasi arsitektur zero-cloud local first' },
      { time: '13:30', topic: 'Q&A kepatuhan retensi log' },
    ],
    decisions: [
      {
        what: 'Pertahankan local-first vault sebagai default enterprise tier',
        why: 'Memenuhi compliance perbankan tanpa biaya sertifikasi cloud terpisah',
        rejected: ['SaaS cloud storage mandatory'],
        topic: 'Product Strategy',
      },
    ],
    actionItems: [
      { task: 'Buat whitepaper keamanan local vault untuk prospek enterprise', owner: 'Maya Lin', due: '5 Okt 2026' },
    ],
  },
  {
    id: 'teams/frontend-chapter-sync',
    title: 'Frontend Chapter: State Management & Milkdown Editor',
    context: 'Sinkronisasi mingguan developer frontend terkait komponen editor dan performa.',
    minutesAgo: 2880,
    durationMins: 50,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Integrasi Milkdown editor di desktop app sekarang sudah sangat mulus dan cepat.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Pastikan serializer remark tidak mengubah list marker dan escaping pada catatan yang sudah ada.',
      },
    ],
    summary:
      'Sinkronisasi chapter frontend membahas integrasi Milkdown Markdown editor dan optimasi rendering React.',
    timeline: [
      { time: '11:00', topic: 'Demo integrasi editor Milkdown v7' },
      { time: '11:30', topic: 'Remark serializer edge cases' },
    ],
    decisions: [
      {
        what: 'Gunakan remark-stringify dengan format preset konsisten',
        why: 'Mencegah dirty diff saat note disimpan ulang tanpa perubahan isi',
        rejected: ['Custom regex serialization'],
        topic: 'Editor Architecture',
      },
    ],
    actionItems: [
      { task: 'Tambahkan test case round-trip remark serializer di note.test.ts', owner: 'Sarah Chen', due: 'Selesai' },
    ],
  },
  {
    id: 'meet/ai-model-benchmarking',
    title: 'AI Provider Benchmarks: Claude vs GPT-4o vs Gemini',
    context: 'Evaluasi akurasi ekstraksi ringkasan, kecepatan token streaming, dan biaya provider AI.',
    minutesAgo: 4320,
    durationMins: 60,
    dialogue: [
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Gemini 1.5 Flash unggul di kecepatan pemrosesan transkrip panjang di atas 10k token.',
      },
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Untuk ekstraksi action items yang kompleks, Claude 3.5 Sonnet memberikan akurasi tertinggi.',
      },
    ],
    summary:
      'Evaluasi komparatif multi-provider AI untuk ringkasan rapat, ekstraksi keputusan, dan latensi token streaming.',
    timeline: [
      { time: '14:00', topic: 'Presentasi hasil benchmark latensi dan token cost' },
      { time: '14:40', topic: 'Rekomendasi preset model untuk user gratis vs pro' },
    ],
    decisions: [
      {
        what: 'Jadikan Gemini 1.5 Flash sebagai preset default bawaan',
        why: 'Latensi terendah dan biaya paling efisien untuk ringkasan real-time',
        rejected: ['GPT-4o sebagai default gratis'],
        topic: 'AI Strategy',
      },
    ],
    actionItems: [
      { task: 'Update tabel preset model di client.ts', owner: 'Sarah Chen', due: '1 Okt 2026' },
    ],
  },
  {
    id: 'meet/mobile-roadmap-2027',
    title: 'Mobile App 2027 Roadmap & Tauri Mobile Exploration',
    context: 'Eksplorasi arsitektur aplikasi mobile lintas platform untuk Android dan iOS.',
    minutesAgo: 5760,
    durationMins: 45,
    dialogue: [
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Proof of concept Tauri Mobile di iOS berhasil membaca SQLite vault secara instan.',
      },
      {
        speaker: 'Maya Lin (Product)',
        text: 'Ini membuka peluang besar untuk user yang ingin mereview action items di perjalanan.',
      },
    ],
    summary:
      'Eksplorasi roadmap pengembangan aplikasi mobile Companion berbasis Tauri 2.0 untuk platform iOS dan Android.',
    timeline: [
      { time: '10:00', topic: 'Demo PoC Tauri 2 Mobile' },
      { time: '10:30', topic: 'Perencanaan milestone Q1 2027' },
    ],
    decisions: [
      {
        what: 'Eksplorasi Tauri Mobile alih-alih Flutter atau React Native terpisah',
        why: 'Bisa berbagi 90% codebase Rust dan TypeScript desktop yang sudah ada',
        rejected: ['Rewrite aplikasi penuh di React Native'],
        topic: 'Mobile Tech Stack',
      },
    ],
    actionItems: [
      { task: 'Uji performa SQLite OPFS di Android emulator', owner: 'Alex Rivera', due: '8 Okt 2026' },
    ],
  },
  {
    id: 'teams/devops-k8s-migration',
    title: 'Kubernetes 1.30 Cluster Upgrade & ArgoCD Pipeline',
    context: 'Perencanaan upgrade infrastruktur container dan penerapan pipeline GitOps.',
    minutesAgo: 7200,
    durationMins: 45,
    dialogue: [
      {
        speaker: 'Budi Santoso (DevOps)',
        text: 'Upgrade node pool staging ke Kubernetes 1.30 sukses tanpa ada packet drop.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Jadwalkan pemeliharaan cluster produksi hari Minggu pukul 02:00 WIB.',
      },
    ],
    summary:
      'Rencana rolling update cluster Kubernetes dan migrasi deployment manifest ke sistem GitOps ArgoCD.',
    timeline: [
      { time: '16:00', topic: 'Laporan uji coba upgrade staging' },
      { time: '16:30', topic: 'Runbook eksekusi cluster produksi' },
    ],
    decisions: [
      {
        what: 'Migrasi deployment manual kubectl ke ArgoCD',
        why: 'Auditing perubahan konfigurasi otomatis tercatat di commit Git',
        rejected: ['Helm charts via CLI runner'],
        topic: 'DevOps Infrastructure',
      },
    ],
    actionItems: [
      { task: 'Finalisasi checklist rollback upgrade K8s prod', owner: 'Budi Santoso', due: 'Sabtu' },
    ],
  },
  {
    id: 'meet/growth-marketing-weekly',
    title: 'Growth & Marketing: Viral Loops & Extension Store SEO',
    context: 'Evaluasi kanal akuisisi pengguna baru dan optimalisasi kata kunci toko ekstensi.',
    minutesAgo: 8640,
    durationMins: 30,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Install ekstensi minggu ini naik 35%, sebagian besar datang dari rekomendasi komunitas Reddit dan Twitter.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Bagus, kita siapkan template banner baru yang menyorot integrasi lokal vault.',
      },
    ],
    summary:
      'Evaluasi metrik akuisisi mingguan, pertumbuhan install Chrome Web Store, dan rencana materi kampanye Q4.',
    timeline: [
      { time: '11:00', topic: 'Analitik traffic Chrome Web Store' },
      { time: '11:20', topic: 'Desain banner promosi baru' },
    ],
    decisions: [
      {
        what: 'Fokuskan copywriting pada "Zero Data Stored on Cloud"',
        why: 'Value proposition privasi terbukti menghasilkan konversi install tertinggi',
        rejected: ['Menonjolkan fitur AI generatif umum'],
        topic: 'Marketing Messaging',
      },
    ],
    actionItems: [
      { task: 'Perbarui screenshot tampilan di web store listing', owner: 'Maya Lin', due: 'Senin' },
    ],
  },
  {
    id: 'meet/design-system-tokens',
    title: 'Design System v2: Typography Tokens & Dark Mode Contrast',
    context: 'Standardisasi token desain untuk kontras aksesibilitas WCAG dan konsistensi UI.',
    minutesAgo: 10080,
    durationMins: 60,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Warna teks sekunder di mode gelap dinaikkan rasio kontrasnya agar nyaman dibaca di layar OLED.',
      },
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Token CSS warna dan radius sekarang sudah sinkron antara extension dan desktop app.',
      },
    ],
    summary:
      'Standardisasi token desain untuk kontras aksesibilitas, tipografi responsif, dan konsistensi komponen visual.',
    timeline: [
      { time: '14:00', topic: 'Audit kontras WCAG 2.1 AA' },
      { time: '14:40', topic: 'Harmonisasi token theme.ts' },
    ],
    decisions: [
      {
        what: 'Terapkan rasio kontras minimum 4.5:1 untuk semua elemen teks',
        why: 'Kepatuhan standar aksesibilitas internasional',
        rejected: ['Tetap memakai muted gray lama'],
        topic: 'UI Accessibility',
      },
    ],
    actionItems: [
      { task: 'Validasi token warna di themes.css', owner: 'Frontend Team', due: 'Selesai' },
    ],
  },
  {
    id: 'teams/incident-postmortem-502',
    title: 'Incident Postmortem: Gateway 502 Outage on Sept 18',
    context: 'Analisis insiden pemadaman gateway 502 dan mitigasi DNS socket timeout.',
    minutesAgo: 11520,
    durationMins: 45,
    dialogue: [
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Penyebab error 502 kemarin teridentifikasi karena koneksi socket pool upstream timeout saat beban mendadak.',
      },
      {
        speaker: 'Budi Santoso (DevOps)',
        text: 'Mitigasi keep-alive timeout dan circuit breaker sudah diterapkan di ingress controller.',
      },
    ],
    summary:
      'Postmortem mendalam terkait insiden lonjakan error 502 pada API Gateway dan penerapan mekanisme circuit breaker.',
    timeline: [
      { time: '15:00', topic: 'Kronologi insiden 18 September' },
      { time: '15:25', topic: 'Akar masalah dan mitigasi teknis' },
    ],
    decisions: [
      {
        what: 'Pasang circuit breaker dengan threshold 5% failure rate',
        why: 'Mencegah cascade failure menyebar ke seluruh microservice',
        rejected: ['Menaikkan retry tanpa backoff'],
        topic: 'Resilience',
      },
    ],
    actionItems: [
      { task: 'Publikasikan laporan postmortem ke portal internal', owner: 'Sarah Chen', due: 'Selesai' },
    ],
  },
  {
    id: 'meet/investor-update-q3',
    title: 'Q3 Investor & Stakeholder Progress Briefing',
    context: 'Laporan perkembangan kuartal ketiga kepada investor dan pemangku kepentingan.',
    minutesAgo: 14400,
    durationMins: 60,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Pertumbuhan active users bulanan mencapai target 250% dibanding kuartal sebelumnya.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Kapasitas sistem dan efisiensi biaya server tetap stabil di bawah budget operasional.',
      },
    ],
    summary:
      'Laporan perkembangan kuartal ketiga kepada investor, pencapaian metrik retensi produk, dan proyeksi kuartal empat.',
    timeline: [
      { time: '16:00', topic: 'Presentasi finansial dan traksi pengguna' },
      { time: '16:40', topic: 'Roadmap pengembangan Q4' },
    ],
    decisions: [
      {
        what: 'Fokuskan pendanaan Q4 pada ekspansi fitur enterprise security',
        why: 'Potensi deal kontrak tahunan yang jauh lebih besar',
        rejected: ['Ekspansi iklan berbayar skala besar'],
        topic: 'Company Strategy',
      },
    ],
    actionItems: [
      { task: 'Distribusi deck presentasi ke semua pemegang saham', owner: 'Maya Lin', due: 'Selesai' },
    ],
  },
  {
    id: 'meet/billing-stripe-tax-calc',
    title: 'Billing Engine: Stripe Tax Automation & EU VAT Compliance',
    context: 'Integrasi mesin penagihan Stripe Tax dan penyesuaian aturan PPN Uni Eropa.',
    minutesAgo: 17280,
    durationMins: 40,
    dialogue: [
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Modul Stripe Tax sekarang otomatis mendeteksi kode pos dan negara pembeli untuk kalkulasi PPN.',
      },
      {
        speaker: 'Budi Santoso (DevOps)',
        text: 'Log transaksi pembayaran sudah disinkronkan ke pembukuan akuntansi secara real-time.',
      },
    ],
    summary:
      'Implementasi otomatisasi pajak internasional Stripe Tax dan integrasi penerbitan faktur pajak otomatis.',
    timeline: [
      { time: '10:00', topic: 'Demo integrasi Stripe Tax API' },
      { time: '10:30', topic: 'Pengujian kepatuhan pajak Eropa & US' },
    ],
    decisions: [
      {
        what: 'Gunakan Stripe Tax bawaan dibanding vendor pihak ketiga',
        why: 'Integrasi langsung dengan Stripe Billing tanpa latensi API tambahan',
        rejected: ['Integrasi TaxJar terpisah'],
        topic: 'Billing Infrastructure',
      },
    ],
    actionItems: [
      { task: 'Uji simulasi checkout di 5 negara berbeda', owner: 'Alex Rivera', due: 'Selesai' },
    ],
  },
  {
    id: 'teams/quarterly-all-hands',
    title: 'Q3 Townhall & All-Hands Engineering Showcase',
    context: 'Pertemuan akbar seluruh tim menutup kuartal 3 dan demo pencapaian proyek.',
    minutesAgo: 20160,
    durationMins: 90,
    dialogue: [
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Apresiasi luar biasa untuk seluruh tim engineering yang berhasil merilis v1.15 tepat waktu.',
      },
      {
        speaker: 'Maya Lin (Product)',
        text: 'User review di store mencapai rating 4.9 bintang, terima kasih atas dedikasi semuanya!',
      },
    ],
    summary:
      'Pertemuan akbar seluruh tim menutup kuartal 3, demo inovasi fitur internal, dan sesi tanya jawab kepemimpinan.',
    timeline: [
      { time: '13:00', topic: 'Sambutan pembuka & refleksi pencapaian Q3' },
      { time: '13:45', topic: 'Showcase fitur dan demo teknologi baru' },
      { time: '14:20', topic: 'Sesi Q&A terbuka dan penghargaan tim' },
    ],
    decisions: [
      {
        what: 'Jadikan hackathon internal sebagai agenda rutin per kuartal',
        why: 'Mendorong inovasi spontan seperti fitur standalone mock dan diagram generator',
        rejected: ['Hanya mengandalkan sprint backlog terencana'],
        topic: 'Team Culture',
      },
    ],
    actionItems: [
      { task: 'Dokumentasikan hasil demo showcase ke internal knowledge base', owner: 'Frontend Team', due: 'Selesai' },
    ],
  },
  {
    id: 'meet/incident-review-ddos',
    title: 'Post-Incident Review: Cloudflare Rate Limiting & DDoS Mitigation',
    context: 'Evaluasi insiden serangan HTTP flood ke edge endpoint dan konfigurasi WAF.',
    minutesAgo: 23040,
    durationMins: 45,
    dialogue: [
      {
        speaker: 'Budi Santoso (DevOps)',
        text: 'Rate limiting per IP di level CDN berhasil menahan 98% request mencurigakan saat mitigasi aktif.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Tambahkan challenge Captcha untuk traffic non-browser agar pengguna asli tidak terblokir.',
      },
    ],
    summary: 'Post-incident review insiden DDoS dan penguatan aturan firewall WAF pada domain utama.',
    timeline: [
      { time: '14:00', topic: 'Analisis traffic spike DDoS' },
      { time: '14:30', topic: 'Aturan rate limiting WAF' },
    ],
    decisions: [
      {
        what: 'Pasang Managed Challenge pada rate-limit rule 100 req/min',
        why: 'Memblokir bot scraping tanpa mengganggu pengguna nyata',
        rejected: ['Blokir IP statis manual'],
        topic: 'Edge Security',
      },
    ],
    actionItems: [
      { task: 'Update firewall ruleset di Cloudflare WAF', owner: 'Budi Santoso', due: 'Selesai' },
    ],
  },
  {
    id: 'teams/sprint-retrospective-41',
    title: 'Sprint Retrospective: Sprint 41 Reflection & Improvements',
    context: 'Retrospektif tim akhir Sprint 41 membahas velocity, bottle-neck PR, dan kepuasan kerja.',
    minutesAgo: 25920,
    durationMins: 60,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Semua tiket user story selesai tepat waktu, tapi ada beberapa PR yang tertahan review lebih dari 2 hari.',
      },
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Kita sepakati review SLA maksimal 24 jam untuk mempercepat siklus merge.',
      },
    ],
    summary: 'Sprint retrospective 41 menetapkan SLA review PR maksimal 24 jam dan otomasi testing lint di git hook.',
    timeline: [
      { time: '16:00', topic: 'Review apa yang berjalan baik di Sprint 41' },
      { time: '16:40', topic: 'Kesepakatan SLA Code Review 24 jam' },
    ],
    decisions: [
      {
        what: 'Terapkan SLA review PR 24 jam pada hari kerja',
        why: 'Mencegah stale branches dan merge conflicts berulang',
        rejected: ['Menghilangkan approval requirement'],
        topic: 'Engineering Process',
      },
    ],
    actionItems: [
      { task: 'Pasang bot reminder review PR di Slack channel', owner: 'Alex Rivera', due: 'Selesai' },
    ],
  },
  {
    id: 'meet/security-compliance-gdpr',
    title: 'Legal & Privacy: GDPR Compliance & Data Export Spec',
    context: 'Review regulasi privasi data Uni Eropa dan spesifikasi endpoint download data user.',
    minutesAgo: 28800,
    durationMins: 45,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Pengguna di Uni Eropa berhak meminta penghapusan seluruh data transkrip dalam 30 hari.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Karena data kita tersimpan di vault lokal user, kita sediakan tombol "Delete Vault Permanently" yang transparan.',
      },
    ],
    summary: 'Penyesuaian kepatuhan GDPR pasal "Right to Erasure" pada aplikasi desktop dan browser extension.',
    timeline: [
      { time: '11:00', topic: 'Audit persyaratan kepatuhan GDPR' },
      { time: '11:30', topic: 'Spesifikasi fitur penghapusan data lokal' },
    ],
    decisions: [
      {
        what: 'Sediakan opsi hard-delete lokal tanpa jejak audit remote',
        why: 'Memenuhi prinsip privasi penuh GDPR article 17',
        rejected: ['Soft delete di cloud backend'],
        topic: 'Privacy Compliance',
      },
    ],
    actionItems: [
      { task: 'Dokumentasikan panduan privasi GDPR di privacy policy', owner: 'Maya Lin', due: 'Selesai' },
    ],
  },
  {
    id: 'teams/backend-cache-invalidation',
    title: 'Backend Sync: Distributed Cache Invalidation Patterns',
    context: 'Eksplorasi strategi invalidasi cache terdistribusi menggunakan Redis Pub/Sub.',
    minutesAgo: 31680,
    durationMins: 50,
    dialogue: [
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Pub/Sub Redis memungkinkan node backend langsung menghapus in-memory cache begitu ada event update.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Pastikan penanganan reconnect socket Redis memiliki jitter backoff yang aman.',
      },
    ],
    summary: 'Diskusi pola invalidasi cache terdistribusi untuk mengurangi pembacaan stale data antar instance.',
    timeline: [
      { time: '14:00', topic: 'Evaluasi masalah inkonsistensi cache lokal' },
      { time: '14:35', topic: 'Desain event bus invalidasi Redis Pub/Sub' },
    ],
    decisions: [
      {
        what: 'Gunakan Redis Pub/Sub untuk sinyal invalidasi cache L1',
        why: 'Latensi propagasi sub-millisecond ke seluruh pod backend',
        rejected: ['Polling timestamp periodik dari database'],
        topic: 'Distributed Systems',
      },
    ],
    actionItems: [
      { task: 'Implementasi listener Redis Pub/Sub di sync server', owner: 'Alex Rivera', due: 'Selesai' },
    ],
  },
  {
    id: 'meet/user-interview-enterprise-pilot',
    title: 'User Interview: Enterprise Pilot Feedback from Bank Mandiri',
    context: 'Wawancara feedback pilot project pengguna internal korporat perbankan.',
    minutesAgo: 34560,
    durationMins: 60,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Tim analis risiko sangat menyukai fitur Decision Log karena memudahkan lacak jejak keputusan komite.',
      },
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'Mereka meminta dukungan format ekspor PDF yang bisa diberi watermark logo instansi.',
      },
    ],
    summary: 'Feedback positif dari pengguna uji coba enterprise terkait kemudahan pembuatan MoM otomatis dan audit keputusan.',
    timeline: [
      { time: '13:00', topic: 'Presentasi hasil wawancara pilot' },
      { time: '13:40', topic: 'Prioritas fitur ekspor dokumen resmi' },
    ],
    decisions: [
      {
        what: 'Tambahkan opsi watermark instansi pada PDF export',
        why: 'Syarat wajib arsip compliance korporat perbankan',
        rejected: ['Hanya menyediakan format markdown mentah'],
        topic: 'Enterprise Features',
      },
    ],
    actionItems: [
      { task: 'Kembangkan fitur watermark PDF exporter', owner: 'Frontend Team', due: 'Selesai' },
    ],
  },
  {
    id: 'teams/ci-cd-optimization-arm64',
    title: 'DevOps: GitHub Actions Runner Migration to ARM64',
    context: 'Migrasi CI/CD runner ke instance ARM64 untuk memangkas waktu build dan biaya.',
    minutesAgo: 37440,
    durationMins: 40,
    dialogue: [
      {
        speaker: 'Budi Santoso (DevOps)',
        text: 'Runner ARM64 memangkas durasi kompilasi cargo build Tauri dari 14 menit menjadi 6 menit.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Biaya runner bulanan juga turun sekitar 40%, langsung terapkan ke semua workflow.',
      },
    ],
    summary: 'Optimalisasi pipeline CI/CD GitHub Actions dengan runner ARM64 menghasilkan peningkatan kecepatan 2x lipat.',
    timeline: [
      { time: '10:00', topic: 'Benchmark durasi build Rust x86 vs ARM64' },
      { time: '10:30', topic: 'Pembaruan GitHub workflow matrix' },
    ],
    decisions: [
      {
        what: 'Alihkan build desktop Tauri ke self-hosted ARM64 runners',
        why: 'Pangkas waktu CI 55% dan hemat biaya komputasi',
        rejected: ['Tetap memakai default x86 GitHub runners'],
        topic: 'CI Infrastructure',
      },
    ],
    actionItems: [
      { task: 'Update konfigurasi matrix runner di .github/workflows', owner: 'Budi Santoso', due: 'Selesai' },
    ],
  },
  {
    id: 'meet/design-critique-milkdown',
    title: 'Design Critique: Note Editor Toolbar & Floating Bubble',
    context: 'Evaluasi estetika dan ergonomi toolbar formatting pada editor catatan Milkdown.',
    minutesAgo: 40320,
    durationMins: 45,
    dialogue: [
      {
        speaker: 'Maya Lin (Product)',
        text: 'Floating bubble menu lebih ringkas dibanding toolbar atas yang memakan ruang vertikal layar.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Pastikan keyboard shortcut markdown standar seperti Ctrl+B dan `#` tetap prioritas utama.',
      },
    ],
    summary: 'Penyelarasan tampilan toolbar editor desktop dengan konsep minimalis dan responsif.',
    timeline: [
      { time: '15:00', topic: 'Review mockup floating bubble menu' },
      { time: '15:35', topic: 'Keyboard accessibility & shortcuts' },
    ],
    decisions: [
      {
        what: 'Implementasikan floating bubble menu seleksi teks di Milkdown',
        why: 'Tampilan editor lebih bersih dan fokus pada tulisan (zen mode)',
        rejected: ['Fixed header toolbar yang selalu tampak'],
        topic: 'Editor UX',
      },
    ],
    actionItems: [
      { task: 'Styling floating bubble menu di Milkdown plugin', owner: 'Frontend Team', due: 'Selesai' },
    ],
  },
  {
    id: 'teams/search-engine-sqlite-fts5',
    title: 'Data Architecture: SQLite FTS5 Ranking & Stemming Tunings',
    context: 'Eksperimen tuning BM25 ranking dan porter stemmer untuk pencarian cepat transkrip.',
    minutesAgo: 43200,
    durationMins: 50,
    dialogue: [
      {
        speaker: 'Alex Rivera (Backend)',
        text: 'FTS5 dengan bobot BM25 pada judul memberikan relevansi pencarian 80% lebih akurat.',
      },
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Integrasikan token stemming Bahasa Indonesia dan Inggris secara bilingual.',
      },
    ],
    summary: 'Tuning algoritma pencarian teks penuh SQLite FTS5 untuk pencarian multibahasa instan di Command Palette.',
    timeline: [
      { time: '11:00', topic: 'Evaluasi akurasi pencarian BM25' },
      { time: '11:40', topic: 'Konfigurasi tokenizer unicode61 & stemmer' },
    ],
    decisions: [
      {
        what: 'Terapkan bobot BM25: 10.0 untuk judul, 2.0 untuk transkrip',
        why: 'Menghasilkan hasil pencarian yang langsung relevan bagi pengguna',
        rejected: ['Default equal-weight ranking'],
        topic: 'Search Optimization',
      },
    ],
    actionItems: [
      { task: 'Tulis unit test pencarian BM25 di store.test.ts', owner: 'Alex Rivera', due: 'Selesai' },
    ],
  },
  {
    id: 'meet/executive-sync-q4-budget',
    title: 'Executive Sync: Q4 Budget Allocation & Hiring Strategy',
    context: 'Perencanaan alokasi anggaran operasional dan rekrutmen engineer baru untuk kuartal empat.',
    minutesAgo: 46080,
    durationMins: 60,
    dialogue: [
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Kita butuh tambahan 1 Senior Backend Engineer untuk menangani real-time sync server.',
      },
      {
        speaker: 'Maya Lin (Product)',
        text: 'Anggaran disetujui, pembukaan lowongan bisa dipublish mulai minggu depan.',
      },
    ],
    summary: 'Persetujuan anggaran hiring teknis Q4 dan proyeksi biaya infrastruktur cloud untuk ekspansi pengguna.',
    timeline: [
      { time: '14:00', topic: 'Review alokasi budget headcount Q4' },
      { time: '14:45', topic: 'Timeline rekrutmen dan orientasi karyawan' },
    ],
    decisions: [
      {
        what: 'Buka 2 lowongan rekayasa teknis: 1 Senior Rust Backend & 1 Frontend React',
        why: 'Mendukung percepatan rilis platform sinkronisasi mobile',
        rejected: ['Outsourcing tim pihak ketiga'],
        topic: 'Organizational Strategy',
      },
    ],
    actionItems: [
      { task: 'Publikasi job description di portal karir', owner: 'HR Team', due: 'Selesai' },
    ],
  },
  {
    id: 'teams/annual-strategy-vision-2027',
    title: 'Annual Strategy: Vision 2027 & The Future of Local-First AI',
    context: 'Sesi visi tahunan membahas tren masa depan asisten rapat berbasis AI lokal dan privasi mutlak.',
    minutesAgo: 50400,
    durationMins: 90,
    dialogue: [
      {
        speaker: 'Sarah Chen (Lead Architect)',
        text: 'Masa depan produktivitas adalah privasi mutlak: user memiliki 100% datanya di perangkat lokal.',
      },
      {
        speaker: 'Maya Lin (Product)',
        text: 'Companion memimpin paradigma ini dengan kombinasi ekstensi browser ringan dan desktop vault lokal.',
      },
    ],
    summary: 'Perumusan visi strategis jangka panjang Companion sebagai pelopor asisten produktivitas rapat local-first di Asia Tenggara.',
    timeline: [
      { time: '09:00', topic: 'Keynote Visi 2027: Era Local-First AI' },
      { time: '10:00', topic: 'Breakout groups: Produk, Arsitektur, dan Ekosistem' },
      { time: '10:30', topic: 'Penyusunan manifesto privasi pengguna' },
    ],
    decisions: [
      {
        what: 'Jadikan "Zero-Cloud Obligation" sebagai DNA utama roadmap Companion 2027',
        why: 'Diferensiasi kompetitif terkuat terhadap asisten AI berbasis cloud proprietary',
        rejected: ['Pivot ke model penyimpanan server terpusat'],
        topic: 'Long-term Vision',
      },
    ],
    actionItems: [
      { task: 'Susun manifesto produk local-first AI untuk website publik', owner: 'Sarah Chen', due: 'Selesai' },
    ],
  },
];

function createInitialStorage(): Record<string, unknown> {
  const now = Date.now();
  const storage: Record<string, unknown> = {
    theme: 'system',
    lang: 'system',
  };

  for (const seed of MOCK_SEEDS) {
    const startedAt = new Date(now - seed.minutesAgo * 60 * 1000).toISOString();
    const lastSeenAt = new Date(now - (seed.minutesAgo - seed.durationMins) * 60 * 1000).toISOString();

    const meta: MeetingMeta = {
      id: seed.id,
      startedAt,
      lastSeenAt,
    };

    const entries: Entry[] = seed.dialogue.map((d, idx) => ({
      speaker: d.speaker,
      text: d.text,
      time: new Date(now - (seed.minutesAgo - (idx + 1) * 2) * 60 * 1000).toISOString(),
    }));

    const analysis: AnalysisRecord = {
      status: 'done',
      provider: 'gemini',
      generatedAt: lastSeenAt,
      analysis: {
        executiveSummary: seed.summary,
        timeline: seed.timeline,
        keyDiscussions: seed.dialogue.map((d) => `${d.speaker}: ${d.text}`),
        decisions: seed.decisions,
        actionItems: seed.actionItems,
        risks: [],
        openQuestions: [],
        nextSteps: seed.actionItems.map((a) => a.task),
        diagrams: seed.diagram ? [seed.diagram] : [],
      },
    };

    storage[`meta:${seed.id}`] = meta;
    storage[`title:${seed.id}`] = seed.title;
    storage[`context:${seed.id}`] = seed.context;
    storage[`transcript:${seed.id}`] = entries;
    storage[`analysis:${seed.id}`] = analysis;
  }

  return storage;
}

type StorageChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

function getStorageItem(key: string): string | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* ignore */
  }
}

function removeStorageItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

function setupMock(): void {
  if (typeof window === 'undefined') return;

  // If chrome.storage is already available (e.g. running inside real Chrome Extension), do nothing.
  if (window.chrome?.storage?.local) return;

  let memory: Record<string, unknown> = {};

  const raw = getStorageItem(STORAGE_KEY);
  if (raw) {
    try {
      memory = JSON.parse(raw);
    } catch {
      /* fallback to empty memory */
    }
  }

  // Seed initial data if empty or has fewer than 25 meetings
  const meetingCount = Object.keys(memory).filter((k) => k.startsWith('meta:')).length;
  if (meetingCount < 25) {
    const initial = createInitialStorage();
    memory = { ...initial, ...memory };
    setStorageItem(STORAGE_KEY, JSON.stringify(memory));
  }

  const listeners = new Set<StorageChangeListener>();

  const persist = () => {
    setStorageItem(STORAGE_KEY, JSON.stringify(memory));
  };

  const notify = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => {
    for (const listener of listeners) {
      try {
        listener(changes, 'local');
      } catch (err) {
        console.error('[Dev Mock] listener error:', err);
      }
    }
  };

  const storageLocal = {
    get: async (
      keys?: string | string[] | Record<string, unknown> | null,
    ): Promise<Record<string, unknown>> => {
      if (keys === null || keys === undefined) {
        return { ...memory };
      }
      if (typeof keys === 'string') {
        return { [keys]: memory[keys] };
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in memory) out[k] = memory[k];
        }
        return out;
      }
      if (typeof keys === 'object') {
        const out: Record<string, unknown> = { ...keys };
        for (const k of Object.keys(keys)) {
          if (k in memory) out[k] = memory[k];
        }
        return out;
      }
      return {};
    },

    set: async (items: Record<string, unknown>): Promise<void> => {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: memory[k], newValue: v };
        memory[k] = v;
      }
      persist();
      notify(changes);
    },

    remove: async (keys: string | string[]): Promise<void> => {
      const arr = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const k of arr) {
        if (k in memory) {
          changes[k] = { oldValue: memory[k], newValue: undefined };
          delete memory[k];
        }
      }
      persist();
      notify(changes);
    },

    clear: async (): Promise<void> => {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(memory)) {
        changes[k] = { oldValue: v, newValue: undefined };
      }
      memory = {};
      persist();
      notify(changes);
    },
  };

  const storageOnChanged = {
    addListener: (callback: StorageChangeListener) => {
      listeners.add(callback);
    },
    removeListener: (callback: StorageChangeListener) => {
      listeners.delete(callback);
    },
    hasListener: (callback: StorageChangeListener) => listeners.has(callback),
  };

  const mockChrome = {
    storage: {
      local: storageLocal,
      onChanged: storageOnChanged,
    },
    runtime: {
      getManifest: () => ({
        name: 'Meet Companion (Dev Preview)',
        version: '1.15.0',
        manifest_version: 3,
      }),
      getURL: (path: string) => `/${path.replace(/^\//, '')}`,
      sendMessage: async (msg: unknown) => {
        console.info('[Dev Mock chrome.runtime.sendMessage]', msg);
        const m = msg as { type?: string; op?: string; args?: Record<string, unknown>; question?: string } | undefined;
        if (m?.type === 'db') {
          if (m.op === 'session') {
            const sid = (m.args?.id as string) || '';
            return {
              ok: true,
              data: {
                id: sid,
                startedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
                endedAt: null,
                durationMs: 35 * 60 * 1000,
                platform: sid.startsWith('teams/') ? 'teams' : 'google-meet',
                participants: ['Sarah Chen', 'Alex Rivera', 'Budi Santoso', 'Maya Lin'],
                projectId: null,
                agenda: '',
              },
            };
          }
          if (m.op === 'carry-over') {
            return { ok: true, data: { openActions: [], openQuestions: [] } };
          }
          if (m.op === 'chronology') {
            const mockEvents = MOCK_SEEDS.slice(0, 10).map((s, idx) => ({
              kind: (idx % 2 === 0 ? 'decision' : 'action') as 'decision' | 'action' | 'question' | 'question-resolved',
              at: new Date(Date.now() - s.minutesAgo * 60 * 1000).toISOString(),
              sessionId: s.id,
              sessionTitle: s.title,
              text: s.actionItems[0]?.task || s.decisions[0]?.what || s.title,
              entityId: idx + 1,
            }));
            const mockRevisions = [
              {
                topic: 'Database Architecture',
                decisions: [
                  {
                    id: 1,
                    sessionId: 'meet/arch-sync-2026',
                    topic: 'Database Architecture',
                    decision: 'Implementasi Read/Write Splitting di DataSource layer',
                    reason: 'Menghilangkan beban query baca berat dari database utama',
                    rejected: ['Vertical scaling DB utama'],
                    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
                    supersededBy: null,
                  },
                ],
              },
              {
                topic: 'Gateway Caching',
                decisions: [
                  {
                    id: 2,
                    sessionId: 'meet/arch-sync-2026',
                    topic: 'Gateway Caching',
                    decision: 'Redis Caching untuk validasi token sesi auth',
                    reason: 'Memangkas 60% pemanggilan query auth berulang ke database',
                    rejected: ['In-memory local cache per instance'],
                    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
                    supersededBy: null,
                  },
                ],
              },
            ];
            const mockActions = MOCK_SEEDS.flatMap((s, sIdx) =>
              s.actionItems.map((item, aIdx) => ({
                id: sIdx * 10 + aIdx + 1,
                sessionId: s.id,
                task: item.task,
                owner: item.owner,
                dueAt: item.due,
                status: 'open' as const,
                externalRef: null,
                externalUrl: null,
                createdAt: new Date(Date.now() - s.minutesAgo * 60 * 1000).toISOString(),
              })),
            );

            return {
              ok: true,
              data: {
                events: mockEvents,
                revisions: mockRevisions,
                openQuestions: [],
                openActions: mockActions,
                overdueActions: [],
              },
            };
          }
          if (m.op === 'actions') {
            const mockActions = MOCK_SEEDS.flatMap((s, sIdx) =>
              s.actionItems.map((item, aIdx) => ({
                id: sIdx * 10 + aIdx + 1,
                sessionId: s.id,
                task: item.task,
                owner: item.owner,
                dueAt: item.due,
                status: 'open' as const,
                externalRef: null,
                externalUrl: null,
                createdAt: new Date(Date.now() - s.minutesAgo * 60 * 1000).toISOString(),
              })),
            );
            return { ok: true, data: mockActions };
          }
          if (m.op === 'set-action-status') {
            return { ok: true, data: { ok: true } };
          }
          if (m.op === 'push-issue') {
            return { ok: true, data: { ref: 'TRACKER-42', alreadyPushed: false } };
          }
          if (m.op === 'refresh-issues') {
            return { ok: true, data: { checked: 3, changed: 0, failed: [] } };
          }
          return { ok: true, data: [] };
        }
        if (m?.type === 'global-ask') {
          const q = m.question || '';
          return {
            ok: true,
            result: {
              answer: `Berdasarkan 15 rekaman rapat: Terkait pertanyaan "${q}", tim menyepakati implementasi arsitektur Read/Write Splitting DB, token caching Redis, dan standar token WCAG 2.1 AA untuk UI extension.`,
              answerability: 'grounded',
              confidence: 0.94,
              sessions: [
                {
                  id: 'meet/arch-sync-2026',
                  title: 'Q3 System Architecture & Performance Review',
                  startedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
                },
                {
                  id: 'meet/product-ui-revamp',
                  title: 'Product UI/UX Revamp & Standalone Mode',
                  startedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
                },
              ],
              evidence: [
                {
                  sessionId: 'meet/arch-sync-2026',
                  speakers: ['Sarah Chen', 'Alex Rivera'],
                  preview: 'Solusi jangka pendek kita pisahkan query read/write di DataSource layer dan Redis session cache.',
                },
              ],
            },
          };
        }
        return { ok: true, data: [] };
      },
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
        hasListener: () => false,
      },
      lastError: undefined,
    },
    permissions: {
      contains: async () => true,
      request: async () => true,
    },
    identity: {
      getRedirectURL: () => 'http://localhost:5173/oauth2',
      launchWebAuthFlow: async () => 'http://localhost:5173/oauth2#token=mock',
    },
    action: {
      onClicked: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
    notifications: {
      create: () => {},
      clear: () => {},
      onClicked: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
  };

  // Assign to window.chrome
  const win = window as unknown as { chrome?: typeof mockChrome; __resetDevData?: () => void };
  win.chrome = {
    ...(win.chrome ?? {}),
    ...mockChrome,
  } as typeof mockChrome;

  win.__resetDevData = () => {
    removeStorageItem(STORAGE_KEY);
    window.location.reload();
  };

  console.info(
    '%c[Meet Companion]%c Standalone localhost dev mock active! Call %c__resetDevData()%c to reset dummy meetings.',
    'color: #46e394; font-weight: bold;',
    'color: inherit;',
    'color: #eec26a; font-family: monospace;',
    'color: inherit;',
  );
}

setupMock();
