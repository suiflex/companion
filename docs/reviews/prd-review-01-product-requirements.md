# PRD Review — docs/01-product-requirements.md

Reviewer: Pak Deadlineo (PM review)
Authority: docs/COMPANION_UNIFIED_ARCHITECTURE.md — §32 (phases, L1481–1539), §32.1 (gates G1/G2/G3/G1', L1541–1556), §36 (surfaces, L1635–1666), §37 (decision log D1–D9, L1668–1680)
Verdict: **NEEDS_CHANGES** (6 wajib; struktur dokumen tidak perlu diubah)

## (1) Path P0/P1 → gate/phase

Kolom "Path (phase / gate)" ada (PRD L16) dan keenam baris P0/P1 (L18–L23) terisi. Akurasi terhadap otoritas: L19 vs D1 ✓, L20 vs D2 ✓, L22 vs §32.1/D5/D9 ✓, L23 go-rule A1–A5 vs D9 ✓.

- **F-1a (L18)** — klaim "hardening = Phase 0" tidak sesuai: Phase 0 di §32 (L1485–1491) adalah refactor DTO + isolasi adapter browser dengan DoD regresi, bukan hardening capture/provider/export.
  Fix: ubah menjadi "Shipped; regression-protected by Phase 0 DoD".
- **F-1b (L23)** — path bridge tidak menyebut dependensi Phase 1, padahal bridge membutuhkan desktop hasil Phase 1 yang gated.
  Fix: tambah "after Phase 1 (gated) and spike go".

## (2) Acceptance criteria terukur + owner

Delapan AC (L39–46) semuanya punya angka/threshold dan owner (product owner ×4, owner, AI engineer, extension engineer, desktop engineer) ✓.

- **F-2a (L39, AC1)** — "≥30% of active users": "active user" tak terdefinisi sehingga metrik tak terkomputasi.
  Fix: definisikan active user (mis. ≥1 capture/export event dalam 30 hari dari audit log).
- **F-2b (L40, AC2)** — "week 2" tidak jelas dihitung dari apa; denominator "first-time exporters" berbeda dengan "of G1 exporters" di §32.1.
  Fix: samakan menjadi "≥50% dari kohort G1 mengekspor lagi pada minggu ke-2 sejak ekspor pertamanya".
- **F-2c (L42, AC4)** — owner ditulis "owner" (ambigu antara product owner dan business owner).
  Fix: samakan label dengan AC1–AC3 atau tegaskan business owner.
- **F-2d (L21 vs L39–46)** — deliverable Phase 0 (op IDs, portability split, ADR-013) tidak punya AC satu pun.
  Fix: tambah AC yang mereferensi DoD §32 Phase 0 ("archive round-trip equal IDs/counts/hashes", automated tests, owner: extension engineer).

## (3) Anchor waktu (roadmap dependency-driven — dinilai apakah anchor cukup)

Anchor relatif yang ada: 14 hari (AC1), week 2 (AC2), 4 minggu (AC3), 3 minggu (AC4), 6 minggu (AC7), 5 hari spike (L22), ±1 sprint (L20) — konsisten dengan §32 dependency-driven; tidak ada demand kalender. Penilaian: **cukup untuk gate dan probe**, dengan 2 celah:

- **F-3a (L19, Ask v2)** — P0 dengan pain tertinggi menurut D1 tanpa anchor sama sekali: tidak ada durasi/kadens review; exit-nya AC5 murni event kualitatif sehingga delay tidak menghasilkan sinyal apa pun.
  Fix: beri anchor seperti D2 (sizing dalam sprint + review tiap sprint boundary terhadap AC5).
- **F-3b (L48)** — semua jendela gate relatif terhadap "release" tanpa event T0 eksplisit, dan konsekuensi gagal gate (shrunk scope per §32.1 L1555 / D5) tidak tertulis di PRD; G1' (AC4) menggantung tanpa konsekuensi keputusan karena §32.1 hanya mendefinisikan G1/G3 → proceed.
  Fix: tambah satu kalimat di L48: "T0 = rilis probe export; jika G1 dan G3 gagal di minggu ke-6, Phase 1 lanjut versi shrunk (meeting reader + light annotation); G1' sustained menjadi bukti pendukung jalur shrunk."

## Non-blocking

Otoritas inkonsisten soal durasi spike — D3 "1 week" vs D9 "hard 5-day timebox". PRD sudah ikut D9 (5 hari), tidak perlu diubah; layak banner di dokumen arsitektur.

## Verdict

**NEEDS_CHANGES** — perubahan wajib:

1. L39 + L48 — definisikan "active user" dan tetapkan T0 = tanggal rilis probe export sebagai origin semua jendela gate.
2. L40 — selaraskan AC2 dengan otoritas: kohort G1, minggu ke-2 sejak ekspor pertama.
3. L19 — anchor waktu untuk Ask v2 (sizing sprint + kadens review terhadap AC5).
4. L48 — eksplisitkan konsekuensi gagal gate (shrunk scope minggu ke-6) dan posisi G1' di decision tree.
5. L21 — tambah acceptance criterion untuk deliverable Phase 0 yang mereferensi DoD §32.
6. L18 — perbaiki klaim "hardening = Phase 0" agar cocok scope Phase 0 di §32.

Setelah 6 item di atas, dokumen layak PASS. Tidak perlu restrukturisasi — tabel, kolom Path, dan kerangka AC sudah benar.
