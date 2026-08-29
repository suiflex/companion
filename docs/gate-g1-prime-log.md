# G1' — Log Self-Audit Mingguan (fallback single-user)

Ini log **manual, tanpa telemetri** untuk sinyal demand **G1'** pada product gate §32.1.
Tidak butuh engineer — diisi langsung oleh Pak Bos selaku pengguna produk.

- **Definisi resmi (§32.1):** *"structured 3-week self-audit: real sessions opening exported files in Obsidian"* — threshold **≥ 2 sesi/minggu, bertahan 3 minggu berturut-turut**. Measurement: manual log.
- **Periode:** 3 minggu berturut-turut mulai **2026-08-28**; jendela berakhir **2026-09-17** — pas sebelum review gate **24 Sep 2026** (ADR-0014).
- **Fungsi:** jalur scope-shrink (D5/D10). Kalau G1/G2 gagal, G1' adalah input keputusan Fase 1 menyusut, paling lambat **2026-10-17** (T0+42).

## Cara menghitung 1 sesi (konvensi — dikunci sejak 2026-08-28)

Satu aktivitas dihitung **1 sesi** hanya jika ketiganya benar:

1. Membuka **file hasil ekspor Obsidian-friendly** di Obsidian (bukan file rapat mentah atau catatan lain).
2. Tujuannya **kebutuhan nyata** — mencari/memakai pengetahuan rapat — bukan sekadar mengecek apakah filenya bisa terbuka.
3. Dipakai minimal **±10 menit** (buka-tutup cepat tidak dihitung).

Catat **jumlah sesi per minggu** (bukan per hari). Kalau ragu suatu aktivitas dihitung atau tidak: putuskan saja, tulis konteksnya di kolom *Catatan* — jangan biarkan kosong.

## Tabel log — isi tiap akhir minggu (Jumat sore)

| Minggu | Tanggal minggu | Jumlah sesi (target ≥ 2) | Catatan |
|---|---|---|---|
| 1 | 2026-08-28 – 2026-09-03 | _isi: __ | Minggu berjalan — diisi Pak Bos di akhir minggu (Jumat 2026-09-04 pagi paling telat). |
| 2 | 2026-09-04 – 2026-09-10 | | |
| 3 | 2026-09-11 – 2026-09-17 | | |

## Cara membaca hasil

- **G1' lulus** jika jumlah sesi ≥ 2 pada **ketiga minggu berturut-turut**.
- G1' lulus → sinyal demand minimal (single-user): input untuk keputusan **GO shrunk** pada review 24 Sep — bukan pengganti G1/G3 (keputusan gate utama tetap mengikuti [ADR-0014](ADR/0014-phase1-demand-gate-nodecision.md)).
- G1' gagal (ada minggu < 2) → itu **hasil produk, bukan kegagalan tim**: memperkuat jalur scope-shrink D5 (meeting-knowledge reader + light annotation) pada keputusan paling lambat 2026-10-17.
- Kosong / tidak diisi = tidak ada sinyal; jangan mundur dari keputusan berbasis bukti (§32.1: demand gate dibaca dari perilaku terukur, bukan kesiapan teknis).

## Referensi

- §32.1 [COMPANION_UNIFIED_ARCHITECTURE.md](COMPANION_UNIFIED_ARCHITECTURE.md) — tabel gate & interpretation rules
- [ADR-0014](ADR/0014-phase1-demand-gate-nodecision.md) — NO-DECISION, syarat re-open, kalender baca 24 Sep
- [demand-gate-audit-32-1.md](demand-gate-audit-32-1.md) — audit kesiapan data (temuan F4: template ini)

## Riwayat perubahan

- 2026-08-28 — Template dibuat (t_88fc6d3d); konvensi "sesi" dikunci; minggu-1 mulai dicatat.
