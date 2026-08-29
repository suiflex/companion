# Audit Demand Gate §32.1 — Kesiapan Data & Instrumentasi

Tanggal: 2026-08-28 · Owner: pak-prdono · Status task: `t_0e585af1`
Pertanyaan yang dijawab: **bisakah gate go/no-go Fase 1 (review 24 Sep 2026) diputuskan dari data?**

---

## 1. Verdict Singkat

| Gate | Definisi (§32.1) | Status data hari ini | Bloker | Dapat dibaca kapan |
|---|---|---|---|---|
| G1 adopsi ekspor | ≥30% pengguna aktif ekspor ≥1× dalam 14 hari sejak T0 | ❌ Tidak terukur — **probe belum punya pemicu UI** | F1, F3 | T0 + 14 hari |
| G2 retensi ekspor | ≥50% kohort G1 ekspor ulang di minggu ke-2 | ❌ Idem, plus butuh jendela 2 minggu | F1, F3 | T0 + ~21 hari |
| G3 Ask lintas-rapat | Ask global yang mengutip ≥2 rapat, tren naik 4 minggu | ❌ **Event audit ada tapi tidak menampung jumlah rapat yang dikutip** | F2, F3 | butuh 4 bucket mingguan setelah instrumen jalan |
| G1' fallback single-user | ≥2 sesi Obsidian/minggu, 3 minggu berturut | ❌ Belum ada template pencatatannya | F4 | bisa mulai kapan saja (manual) |

**Kesimpulan: gate BELUM dapat diputuskan hari ini — dan itu bukan kabar buruk, itu temuan.**
Semua bloker adalah pekerjaan instrumen kecil (total ±2–3 hari engineer, rincian §4).
Dengan syarat instrumen masuk dan probe tayang paling lambat **5 Sep 2026 (T0)**,
review 24 Sep tetap punya G1 penuh + tren G3 3-minggu-pertama untuk diputuskan.
Jika T0 lewat dari ±10 Sep, jendela G1 14-hari melewati tanggal review — output
jujur 24 Sep menjadi "belum dapat diputuskan; tanggal berikutnya X", persis
skenario yang disebut pak-arsitekno: demand gate tidak boleh dipaksakan dari
metrik teknis.

---

## 2. Temuan (evidence-based, dari source `develop@3bfe1449`)

### F1 — Probe ekspor sudah ada tapi belum bisa dipakai user (bloker G1/G2)
`packages/exporters/src/obsidian.ts` + `obsidian.test.ts` sudah terimplementasi
(wiki-links, tag, layout §13.1) — tapi **tidak ada satu pun referensi di
`apps/extension/src/`**: tidak ada tombol, tidak ada handler background. Fitur
yang tidak bisa dipanggil tidak menghasilkan event; T0 tidak bisa dinyatakan.

### F2 — Event `ask.global` tidak menampung jumlah rapat yang dikutip (bloker G3)
`apps/extension/src/background.ts:241` hanya mencatat
`'ask.global', "<60 char pertanyaan> (<answerability>)"`. G3 butuh **jumlah
rapat berbeda yang dikutip evidence** per query — data itu ada saat runtime di
hasil `askMeetings` (spans merged lintas rapat, `globalask.ts:193`) tapi tidak
di Serialize ke audit. G3 saat ini tidak bisa dihitung dari log manapun.
Catatan desain: `AuditEvent` (`types.ts:175`) cukup fleksibel untuk ini — tidak
perlu perubahan tipe, cukup isi `detail` dengan metrik terstruktur.

### F3 — Audit ring 200 event terlalu kecil untuk jendela gate 14 hari + 4 minggu
`packages/shared/src/storage.ts:364-370`: ring `slice(-200)`. Pemakaian normal
(ask, clean, docgen, retention, session.start) menghabiskan 200 slot dalam
beberapa hari pemakaian aktif — event `export.obsidian` minggu pertama bisa
terevict sebelum sempat dibaca. Perbaikan murah: naikkan ke 5.000 event, tetap
dalam kuota `unlimitedStorage`.

### F4 — G1' (fallback single-user) tidak punya artefak pencatatan
G1' adalah input sah untuk jalur scope menyusut (§32.1), tapi tidak ada template
log mingguannya. Owner tidak harus menunggu T0 untuk memulainya.

### F5 — Threshold G1 30% berada di atas median industri — layak dituning SEKARANG (sebelum hasil ada)
Benchmark eksternal (deepsearch 28-08): Userpilot SaaS Product Metrics Benchmark
Report 2024/2025 (547 perusahaan): median core feature adoption **16,5%**,
rata-rata 24,5%, kuartil atas >45%. Pendo 2024: fitur baru yang mencapai
**20–30% dalam 30 hari pertama** sudah tergolong "great". Artinya G1 30% dalam
**14** hari = ambang kelas kuartil atas. §32.1 memberi hak tuning sekali,
**sebelum probe tayang, bukan setelah hasil datang** — jendela itu adalah
sekarang. Rekomendasi (keputusan owner): pertahankan 30% sebagai ambang
"Fase 1 full scope", tambahkan ambang bawah **≥20% = Fase 1 jalur menyusut
langsung** (bukan menunggu kegagalan 6-minggu), karena untuk produk personal
single-user sinyal arah dari 20% pengguna aktif sudah luar biasa kuat. G2 ≥50%
tidak punya jangkar publik yang sebanding — perlakukan sebagai asumsi, boleh
diturunkan ke ≥35% tanpa mengubah makna keputusan.

### F6 — T0 belum dinyatakan; tanggal review ada tapi jangkarnya belum
`docs/06-roadmap.md` menetapkan review gate **24 Sep 2026** dan §3 `01-product-requirements.md`
mendefinisikan T0 = tanggal rilis probe — tapi T0 aktual tidak bisa ditetapkan
sebelum F1 beres. Keputusan owner yang dibutuhkan: **setujui T0 = 5 Sep** sebagai
tanggal komit rilis probe.

### F7 — Dokumentasi gate sendiri sudah konsisten (temuan positif)
INDEX.md ↔ 01-product-requirements §3 ↔ 06-roadmap §"Sinyal" menyatakan G1/G2/G3/G1'
dengan definisi, ambang, owner, dan sumber pengukuran yang identik. Tidak ada
kontradiksi dokumen yang ditemukan. Yang belum detail bukan prosenya —
melainkan **jalur data dari perilaku user ke keputusan** (§4 di bawah).

---

## 3. Jawaban atas "apa yang harus dibangun sebelum gate bisa dibaca"

Semua tetap dalam batas D1 (extension + `packages/{shared,exporters}` — nol
kode desktop/bridge/sync):

| # | Pekerjaan | File | Estimasi |
|---|---|---|---|
| W1 | Wire "Ekspor ke Obsidian (.zip)" ke UI + handler background; panggil exporter yang sudah ada; `appendAudit('export.obsidian', '<meetingCount>')` | `apps/extension/src/` (popup/dashboard + background) | 0,5–1 hari |
| W2 | Serahkan jumlah rapat terkutip ke audit: ubah `ask.global` detail menjadi terstruktur, mis. `meetingsCited=<n>; answerability=<x>` (metrik dihitung dari hasil `askMeetings`) | `background.ts:241`, `globalask.ts` | 0,5 hari |
| W3 | Ring audit 200 → 5.000 event + tes | `storage.ts:368` | <1 jam |
| W4 | Perintah ekspor audit → JSON (untuk dibaca saat review gate; tanpa telemetry tetap terjaga) | `apps/extension/src/` | 0,5 hari |
| W5 | Template `docs/gate-g1-prime-log.md` untuk self-audit G1' | docs | trivial |

## 4. Garis waktu keputusan (asumsi: W1–W4 selesai ≤ 5 Sep)

```text
28 Aug   audit ini (selesai)
≤ 5 Sep  W1–W5 merge → rilis probe → T0 = 5 Sep
5–19 Sep jendela pengukuran G1 (14 hari)
5 Sep–24 Sep  bucket G3 minggu-1..3 + mulai G1'
19 Sep   baca G1 pertama
24 Sep   REVIEW GATE: G1 penuh + G3 tren 3 minggu + G2 parsial
         → go full scope / go shrunk (jika ambang tuning F5 disetujui) / "belum dapat diputuskan" hanya jika T0 molor
```

## 5. Keputusan yang hanya Owner bisa buat (mohon 2 menit, Pak Bos)

1. **Setujui T0 = 5 Sep 2026** sebagai tanggal komit rilis probe (F6).
2. **Tuning threshold (sekali, sebelum hasil):** G1 ≥20% → jalur menyusut
   langsung; G2 → ≥35% (F5). Atau pertahankan angka lama dan menerima risiko
   gate terbaca "gagal" padahal performanya di atas median industri.
3. **Mulai G1' sekarang** (F4) — 3 minggu dari hari ini habis tepat sebelum
   24 Sep; ini satu-satunya sinyal yang tidak butuh engineer sama sekali.
