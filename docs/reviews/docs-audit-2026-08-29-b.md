# Audit dokumentasi `docs/` — 2026-08-29 (konsolidasi, sesi B)

Reviewer: senior architect + product owner.
Menggantikan [`docs-audit-2026-08-29.md`](docs-audit-2026-08-29.md) sebagai audit berjalan;
file itu tetap ada sebagai artefak bertanggal dan tidak diubah isinya.

Basis bukti: `develop@3bfe144` + working tree. Metode: baca 00–09, INDEX, `ADR/*`,
`reviews/*`, `ask-v2-spec.md`, banner roadmap 24-Agu, §31/§32.1/§37 unified — lalu
verifikasi tiap klaim gate langsung ke source (`grep`/`Read`) dan jalankan `npm test`.

Verdict: **dokumen konsisten satu sama lain dan temuan audit sesi A terkonfirmasi seluruhnya,
tetapi seluruh set dokumen belum ter-commit — sehingga proses yang didokumentasikannya
(review ADR via CODEOWNERS, otoritas dokumen, baseline commit) tidak dapat berjalan.**

---

## 0. Verifikasi audit sesi A — semua CONFIRMED

| Temuan sesi A | Bukti eksak (2026-08-29) |
|---|---|
| A1 anchor ≠ T0 | `packages/exporters/src/gate.ts:54` — `anchor = Math.min(...events.map(Date.parse), now)`, bukan T0 |
| A2 G3 tanpa agregasi | `apps/extension/src/background.ts:254` menulis `meetingsCited=`; `grep -rn "weekly\|rollup"` di `apps/extension/src` + `packages/*/src`: nihil |
| A3 payload `export.obsidian` drift | `SummaryView.tsx:202` `'meetings=1'` vs `background.ts:417` `` `meetings=${files.length - 1}` ``; `gate.test.ts` tidak mem-pin payload |
| A4 dokumen gate usang | `AUDIT_RING_MAX = 5_000` (`packages/shared/src/storage.ts:370`), handler export ada — F1/F2/F3 sudah selesai; ADR-0014 + risk register masih membaca dunia pra-patch |
| A5 otoritas berlapis | lihat N6 di bawah, dengan angka |
| A6 ADR tidak resolvable | ADR-008 dirujuk **26×**, ADR-013 **23×** di `docs/**/*.md`; file yang ada hanya `0001`, `0014`, `0015` |

Angka regresi hari ini: `npm test` = **31 file, 389/389 passed**. Artefak review 28-Agu
mencatat 361/361 (28 file) — stale, bukan salah pada saat ditulis.

---

## 1. Temuan baru

### N1 — (Blocker proses) Seluruh `docs/` belum ter-commit
`git status --untracked-files=all docs`: 00–09, `INDEX.md`, `ADR/*`, `reviews/*`,
`ask-v2-spec.md`, `COMPANION_UNIFIED_ARCHITECTURE.md`, `demand-gate-audit-32-1.md`,
`gate-g1-prime-log.md`, `spike-native-messaging-installer.md` semuanya `??`; hanya
`companion-product-architecture-roadmap.md` yang tracked (dan `M`).

Konsekuensi:

- `ADR/README.md:18` mewajibkan ADR menjadi `Accepted` lewat PR review CODEOWNERS.
  Tiga ADR berstatus `Accepted` tanpa PR yang mungkin ada.
- `INDEX.md:3` mengklaim "Evidence baseline: branch `develop`, commit `3bfe1449`" —
  dokumennya sendiri tidak ada di commit itu.
- Aturan "on conflict, COMPANION_UNIFIED_ARCHITECTURE.md wins" (D7) tidak punya
  artefak bersama untuk ditegakkan.

Perbaikan: commit `docs/` (dilakukan bersamaan dengan audit ini). Prasyarat untuk
tindakan lain — lebih dulu dari perbaikan `gate.t0`.

### N2 — Penomoran ADR bertabrakan, bukan sekadar file hilang
Unified §31 mendefinisikan **ADR-001 = local-first architecture**; `docs/ADR/0001-identity-model-uuidv7.md`
= **identity model** (mengangkut ADR-013 unified). Satu label, dua keputusan berbeda.
Tabel pemetaan di `ADR/README.md` tidak cukup — nomor harus dipisah namespace
(mis. `UA-001…UA-013` untuk keputusan §31) atau `ADR/` dinomori ulang di luar rentang 001–013.

### N3 — Kontradiksi otoritas di dalam spec prioritas #1
`ask-v2-spec.md:959` menyatakan `companion-product-architecture-roadmap.md` §9–§18, §31
**"Otoritatif sampai spec ini final"**, sementara `INDEX.md:3` dan D7 menyatakan bagian
tergantikan roadmap itu **"must not be used"**. Spec kanonis untuk P0 tertinggi (D1)
memakai basis otoritas yang dilarang dokumen induknya. Pilih satu, tulis di banner spec.

### N4 — Spec P0 #1 tidak ada di INDEX
`INDEX.md` mengklaim "documentation set complete" tetapi tidak memuat `ask-v2-spec.md`,
`demand-gate-audit-32-1.md`, `spike-native-messaging-installer.md`, `reviews/*`, maupun
roadmap 24-Agu. Efek praktis: pembaca baru menemukan empat sinyal gate desktop (fase yang
belum boleh dikerjakan) tetapi tidak menemukan spec Ask v2 (pekerjaan yang sedang berjalan).

### N5 — DoD Ask v2 tidak dapat dijadwalkan
`ask-v2-spec.md:944` adalah checklist enam item tanpa owner, tanggal, atau metrik.
Diverifikasi: `packages/ai/src/askeval.test.ts` memuat 6 blok eval, dan pencarian fixture
di seluruh repo (`find packages -name "*.json" -path "*fixture*"`) mengembalikan **nol file** —
DoD item #1 ("15 fixture JSON terpisah") dan #3 (`meeting-shared-solution.json` standalone)
belum tersentuh, dan tidak ada tanggal yang bisa dilanggar.

Bandingkan dengan Fase 1 desktop yang **belum boleh dikerjakan**: 4 sinyal gate, 2 ADR,
7 risiko, template log mingguan, kalender review. Inversi perhatian antara apa yang
dikerjakan dan apa yang diukur.

### N6 — Rasio dan duplikasi dokumen
`docs/**/*.md` = **5.797 baris** terhadap source `apps` + `packages` (ts/tsx/js, tanpa
`node_modules`/`dist`) = **18.755 baris** — 31%. 59% dokumen ada di dua file yang saling
tumpang tindih (`COMPANION_UNIFIED_ARCHITECTURE.md` 1.682, `companion-product-architecture-roadmap.md`
1.658). Roadmap yang "sebagian tergantikan" itu **masih ikut diedit** (`M` di git status);
selama masih berubah, aturan "jangan pakai bagian tergantikan" tidak bisa ditegakkan.

### N7 — `docs/.obsidian/` ikut di root dokumen
21 file konfigurasi vault (plugin, tema, `workspace.json`) untracked di `docs/.obsidian/`.
Ditambahkan ke `.gitignore` bersamaan dengan audit ini agar tidak ikut ter-commit.

---

## 2. Temuan produk

### P1 — Jam keputusan owner
Hari ini 2026-08-29. ADR-0014: T0 direkomendasikan ≤ 1 Sep, **hard floor 10 Sep** (di luar itu
jendela G1 14-hari melewati review 24 Sep). Tersisa 12 hari. Hak tuning threshold **hangus
begitu probe tayang** (§32.1) — satu-satunya keputusan irreversible dalam daftar. Baris minggu-1
`gate-g1-prime-log.md` masih kosong, jatuh tempo 2026-09-04 (belum telat). Instrumentasi teknis
praktis selesai (A4), jadi risiko terbesar sekarang bukan engineering melainkan
commit + rilis + keputusan owner.

### P2 — G1/G2 tetap tidak dapat diputuskan secara struktural
Ambang G1 "≥30% pengguna aktif" dan G2 "≥50% kohort G1" adalah metrik fleet, sedangkan NFR
melarang telemetri dan `gate.ts` hanya menghasilkan angka per-device. Tidak ada dokumen yang
menyebut install base, kanal distribusi, atau cara mengumpulkan `gateSummary` dari device lain.
Untuk N=1 sebuah threshold persen hanya bisa bernilai 0% atau 100%. Rekomendasi PO tidak berubah
dari sesi A: turunkan G1/G2 menjadi sinyal observasional single-user secara eksplisit, naikkan
**G1' + G3** sebagai gate utama — dinyatakan tertulis **sebelum** T0.

### P3 — Tiga definisi G2 yang berbeda
| Sumber | Definisi |
|---|---|
| PRD AC2 (`01-product-requirements.md:42`) | ≥50% kohort G1 ekspor lagi di minggu-2 **sejak ekspor pertamanya** |
| `packages/exporters/src/gate.ts:68` | `(week1>0 && week2>0) \|\| week2>=2`, minggu dihitung **dari anchor device** |
| `08-operations.md:37` | "ekspor di minggu 1 dan lagi di minggu 2, atau dua kali dalam minggu 2" |

Jangkar berbeda (ekspor pertama vs anchor ring) memberi hasil berbeda untuk user yang sama.
Kunci satu definisi sebelum T0.

### P4 — Kadens review risiko tanpa bukti berjalan
`07-risk-register.md:51` mewajibkan tiap owner mengecek trigger mingguan sampai gate.
Satu-satunya artefak adalah G1' log (kosong). R4 sudah ter-trigger (A3) tetapi register masih
menulis "All seven risks are currently Open and untriggered".

---

## 3. Yang sudah bagus — jangan diubah

- Rantai bukti QA/probe (`reviews/*`) memuat repro script, angka terukur, dan koreksi kriteria
  **sebelum** gate berjalan (koreksi asersi 409 → `stored:true` tunggal).
- ADR-0015 menolak migrasi UUIDv7 core tables dan menolak perubahan schema sync-server dengan
  alasan biaya/batas E2EE yang eksplisit — dua keputusan "tidak mengerjakan" yang terdokumentasi.
- ADR-0014 merekam NO-DECISION alih-alih memaksa GO dari metrik teknis.
- §32.1 memisahkan "engineering readiness" dari "launch reason".

---

## 4. Urutan tindakan

| # | Tindakan | Biaya | Batas waktu |
|---|---|---|---|
| 1 | Commit `docs/` + `.gitignore` untuk `.obsidian` (N1, N7) | nol engineering | selesai bersama audit ini |
| 2 | Kunci `gate.t0` di `kv`/`chrome.storage` dan pakai sebagai anchor (A1) | ±10 baris + 1 tes | **sebelum T0** — tidak bisa retroaktif |
| 3 | Keputusan owner: tanggal T0, tuning threshold sekali, mulai isi G1' (P1) | nol engineer | ≤ 2026-09-10 |
| 4 | Satukan definisi G2 di kode + PRD + operations (P3); pin payload `export.obsidian` di `gate.test.ts` (A3) | kecil | sebelum T0 |
| 5 | Weekly bucket untuk `meetingsCited` (A2) | kecil | sebelum minggu-4 gate |
| 6 | Target terukur + tanggal untuk Ask v2, setara bobot gate §32.1 (N5) | keputusan | sebelum sprint berikutnya |
| 7 | Segarkan `demand-gate-audit-32-1.md` + status ADR-0014 terhadap working tree (A4) | kecil | sebelum review 24 Sep |
| 8 | Namespace ADR (N2), rapikan otoritas dokumen + INDEX (N3, N4, N6) | sedang | sesudah gate |

---

## 5. Batasan audit

Tidak diverifikasi: isi §1–§30 dan §32–§35 unified di luar §31/§32.1/§37;
`spike-native-messaging-installer.md` (diterima apa adanya sebagai artefak bertanggal);
`npm run typecheck` dan `npm run lint` (tidak dijalankan — hanya `npm test`).
