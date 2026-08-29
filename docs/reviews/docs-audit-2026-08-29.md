# Audit dokumentasi `docs/` — 2026-08-29

> **Superseded oleh [`docs-audit-2026-08-29-b.md`](docs-audit-2026-08-29-b.md)** (konsolidasi sesi B:
> semua temuan di bawah diverifikasi ulang dan CONFIRMED, ditambah temuan N1–N7). Dokumen ini
> dipertahankan utuh sebagai artefak bertanggal.

Reviewer: senior architect + product owner (sesi audit).
Basis bukti: `develop@3bfe144` + working tree (banyak file masih uncommitted, lihat T1).
Metode: baca 00–09, INDEX, ADR/*, reviews/*, demand-gate audit, G1' log, banner
`companion-product-architecture-roadmap.md`, §32.1/§37 unified — lalu verifikasi setiap
klaim gate langsung ke source (`grep`/`Read`), bukan ke dokumen lain.

Verdict: **dokumen konsisten satu sama lain, tapi sudah tertinggal dari kode, dan dua
sinyal gate utama tidak dapat diputuskan secara struktural (bukan karena data belum ada).**

---

## A. Temuan arsitektur

### A1 — (Blocker gate) Definisi window G1/G2 di kode ≠ definisi di dokumen
- Dokumen: "≥1 ekspor dalam **14 hari sejak T0**", T0 = tanggal rilis probe
  (`01-product-requirements.md:39`, `06-roadmap.md:22`, §32.1).
- Kode: `packages/exporters/src/gate.ts:54` — `anchor = min(semua waktu audit event, now)`,
  yaitu **event audit tertua yang masih hidup di ring**, bukan T0.
- Konsekuensi: pengguna yang sudah lama memakai extension punya anchor jauh **sebelum**
  T0 → window 14 hari bisa sudah tertutup pada hari probe rilis (G1 terbaca `false`
  padahal user mengekspor). Pengguna baru punya anchor **sesudah** T0. Angka per device
  tidak sebanding satu sama lain dan tidak sebanding dengan definisi §32.1.
- Perbaikan termurah: simpan `gate.t0` sekali di `kv`/`chrome.storage` saat probe rilis,
  `anchor = t0`. ±10 baris, harus mendahului T0 — sesudah T0 tidak bisa diperbaiki
  retroaktif untuk data yang sudah terkumpul.

### A2 — (Blocker gate) G3 punya event, tidak punya agregasi
`background.ts:254` sudah menulis `meetingsCited=<n>` ke audit (W2 selesai), tapi tidak ada
satu pun kode yang mem-parse detail itu atau menaruhnya ke bucket mingguan
(`grep weekly|rollup` di `apps/extension/src`, `packages/{exporters,shared}/src`: nihil).
G3 butuh **tren 4 minggu**; ADR-0014 syarat re-open (b) I2 menyebut "+ weekly kv rollup" —
belum ada. Ini satu-satunya sinyal yang bisa memicu Fase 1 sendirian (§32.1) dan tetap
tanpa jalur data. Sesuai R7 yang masih Open.

### A3 — Kontrak event `export.obsidian` sudah drift (R4 sudah ter-trigger)
Tiga bentuk payload untuk satu event:
| Sumber | Payload |
|---|---|
| `docs/07-risk-register.md:10` (klaim dokumen) | `meeting.id` |
| `apps/extension/src/components/SummaryView.tsx:202` | `'meetings=1'` |
| `apps/extension/src/background.ts:417` | `` `meetings=${files.length - 1}` `` |

Mitigasi R4 menyebut "a contract test pins the event name and payload shape" —
`packages/exporters/src/gate.test.ts:14` selalu memakai `detail: ''`, jadi payload tidak
dipin sama sekali. Nama event aman (satu konstanta), bentuk detail tidak. Kalau nanti G1
dihitung per-meeting (bukan per-event), dua sumber ini menghasilkan angka berbeda.

### A4 — Dokumen gate sudah usang terhadap working tree
`demand-gate-audit-32-1.md` (28 Agu) mendaftar F1 (probe tanpa pemicu UI), F2
(`ask.global` tanpa jumlah rapat), F3 (ring 200) sebagai bloker. Ketiganya **sudah
dikerjakan** di working tree: `export-obsidian`/`export-audit` handler
(`background.ts:433,439`), tombol di `SummaryView.tsx:202` + `SettingsPanels.tsx:538`,
`AUDIT_RING_MAX = 5_000` (`packages/shared/src/storage.ts:370`). ADR-0014 dan risk
register masih membaca dunia pra-patch. Siapa pun yang membaca `docs/` hari ini akan
mengerjakan ulang W1–W4.

### A5 — Otoritas dokumen terlalu berlapis untuk ukuran tim
5.638 baris, 59% di dua file yang saling tumpang tindih: `COMPANION_UNIFIED_ARCHITECTURE.md`
(1.682, otoritatif) dan `companion-product-architecture-roadmap.md` (1.658, "sebagian
tergantikan" — dan masih ikut dimodifikasi menurut `git status`). 00–09 + glossary
menulis ulang isi §-section unified dengan kata lain. Setiap fakta gate hidup di ≥4 tempat
(§32.1, 01-PRD AC, 06-roadmap, 08-operations, 09-glossary) — A3 dan A4 adalah bukti biaya
sinkronisasinya sudah tertagih. Rekomendasi: jadikan 00–09 satu-satunya permukaan baca,
pindahkan unified + roadmap lama ke `docs/archive/` sebagai referensi historis, hentikan
edit pada roadmap 08-24.

### A6 — Penomoran ADR ganda dan tidak resolvable
Dokumen memanggil ADR-005, ADR-007, ADR-008, ADR-013 (skema §-internal unified), sementara
file yang ada hanya `0001`, `0014`, `0015`. `ADR-0001` bahkan menyebut "Carries: ADR-013".
Pembaca baru tidak bisa membuka ADR-008 yang dirujuk ≥8 kali (termasuk sebagai dasar
keputusan native messaging). Perbaikan: tabel pemetaan di `ADR/README.md`
(ADR-0xx unified → file), atau buat stub record yang menunjuk ke §-nya.

### A7 — Desain berbayar di muka untuk fase yang mungkin menyusut
§13–§18 (vault, sync v2, conflict, attachment, key management) dispesifikasi sangat detail
untuk Fase 1–3 yang **demand-gated dan bisa menyusut jadi "meeting reader + light
annotation"** (D5). Kalau gate NO-GO, mayoritas spesifikasi itu jadi biaya mati dan sumber
inkonsistensi (lihat ADR-0015: temuan gate sudah salah alamat gara-gara schema target-state
dibaca sebagai schema nyata). Cukup simpan keputusan yang berbentuk one-way door (identity,
E2EE boundary); detail tabel/protokol ditulis saat fase dibuka.

---

## B. Temuan produk

### B1 — (Struktural) G1/G2 tidak dapat diputuskan tanpa telemetri
Ambang G1 "≥30% **pengguna aktif**" dan G2 "≥50% kohort G1" adalah metrik **fleet**, tapi
NFR melarang telemetri dan pengukuran hanya per-device (`gate.ts` header, R2). Tidak ada di
dokumen mana pun: berapa install base, kanal distribusi ke pengguna itu, atau mekanisme
mengumpulkan `gateSummary` dari device orang lain. R2 menyebut "manual aggregation" —
tanpa daftar device, itu bukan mitigasi, itu penamaan ulang masalah. Untuk N=1 (kenyataan
hari ini: satu pengguna, lihat G1' log) sebuah threshold persen hanya bisa bernilai 0% atau
100%. Rekomendasi PO: turunkan G1/G2 jadi sinyal observasional single-user secara eksplisit,
naikkan **G1' + G3** jadi gate utama, atau nyatakan install base + cara mengumpulkannya
sebelum T0.

### B2 — Tiga definisi G2 yang berbeda
| Sumber | Definisi |
|---|---|
| PRD AC2 | ≥50% kohort G1 ekspor lagi di minggu-2 **sejak ekspor pertamanya** |
| `gate.ts:68` | `(week1>0 && week2>0) \|\| week2>=2`, minggu dihitung **dari anchor device** |
| `08-operations.md:37` | "ekspor di minggu 1 dan lagi di minggu 2, atau dua kali dalam minggu 2" |
Yang ketiga = kode; yang pertama = dokumen otoritatif. Beda jangkar (ekspor pertama vs
anchor) memberi hasil berbeda untuk user yang sama. Kunci satu definisi sebelum T0.

### B3 — Jam keputusan owner sudah hampir habis
Hari ini 2026-08-29. ADR-0014: T0 direkomendasikan ≤ 1 Sep, **hard floor 10 Sep**; tiga
keputusan owner (kunci T0, tuning threshold sekali, mulai G1') tergantung sejak 28 Agu.
Hak tuning threshold **hangus begitu probe tayang** (§32.1) — itu satu-satunya yang
irreversible di daftar ini. Baris minggu-1 di `gate-g1-prime-log.md` masih kosong
(jatuh tempo 2026-09-04). Instrumentasi teknis praktis sudah selesai (A4), jadi risiko
terbesar sekarang bukan engineering, melainkan **commit + rilis + keputusan owner**.

### B4 — Prioritas #1 punya pengukuran paling lemah
D1 menyatakan Ask v2 adalah pain harian dan mengalahkan semua kode desktop. Yang dimiliki
Ask v2: satu AC (AC5, satu pertanyaan regresi) dan eval suite 6/15 kategori
(`04-ai-ask-engine.md:53`). Yang dimiliki desktop — yang **belum boleh dikerjakan** — 4
sinyal gate, audit khusus, 2 ADR, 7 risiko, template log mingguan, kalender review. Ada
inversi perhatian antara apa yang sedang dikerjakan dan apa yang diukur. Rekomendasi:
target terukur untuk Ask v2 (mis. % jawaban grounded pada eval suite, per sprint boundary),
setara bobotnya dengan gate §32.1.

### B5 — Kadens review risiko tidak punya bukti berjalan
`07-risk-register.md:51` mewajibkan tiap owner mengecek trigger mingguan sampai gate.
Artefak yang ada hanya G1' log (kosong). R4 sudah ter-trigger (A3) tapi masih tercatat
"All seven risks are currently Open and untriggered". Register tanpa jejak eksekusi akan
selalu ketinggalan dari kode.

---

## C. Yang sudah bagus (jangan diubah)

- Rantai bukti QA/probe (`reviews/*`) memuat repro script, angka terukur, dan koreksi
  kriteria sebelum gate jalan (mis. koreksi asersi 409 → `stored:true` tunggal) — ini
  praktik yang lebih kuat dari mayoritas tim.
- ADR-0015 menolak migrasi UUIDv7 core tables dengan alasan biaya/keuntungan yang eksplisit,
  dan menolak perubahan schema sync-server karena melanggar batas E2EE. Dua keputusan
  "tidak mengerjakan" yang benar dan terdokumentasi.
- ADR-0014 merekam NO-DECISION alih-alih memaksa GO dari metrik teknis — persis fungsi gate.
- §32.1 memisahkan "engineering readiness" dari "launch reason"; itu yang menahan proyek ini
  dari membangun Tauri terlalu dini.

---

## D. Urutan tindakan (termurah → terpenting, semua sebelum T0)

1. Kunci `gate.t0` di storage + pakai sebagai anchor (A1). Tanpa ini seluruh data G1/G2 tidak
   berarti apa-apa. ±10 baris + 1 tes.
2. Keputusan owner: tanggal T0, tuning threshold (sekali), mulai isi G1' (B3). Nol engineer.
3. Satukan definisi G2 di kode + PRD + operations (B2), dan pin payload `export.obsidian` di
   `gate.test.ts` (A3).
4. Weekly bucket untuk `meetingsCited` (A2) — tanpa ini G3 tidak akan pernah terbaca 24 Sep.
5. Commit working tree dan segarkan `demand-gate-audit-32-1.md` + ADR-0014 status (A4).
6. Setelah gate: rapikan otoritas dokumen (A5), tabel pemetaan ADR (A6).

Tidak diverifikasi dalam audit ini: isi §1–§31 unified di luar §32.1/§37, spike installer
(diterima apa adanya sebagai artefak bertanggal), dan hasil `npm test` (tidak dijalankan).
