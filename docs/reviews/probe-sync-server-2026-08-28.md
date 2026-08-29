# Probe teknis sync-server — 28 Agu 2026 (malam)

- **Target:** `packages/sync-server` (dist `server.js`, dibangun dari commit `3bfe144`)
- **Metode:** live HTTP terhadap proses server sungguhan di `127.0.0.1`, data dir sementara sekali pakai, dihapus setelah probe. Skrip: `/tmp/dewi-probe.mjs` (node murni, tanpa dependensi; spawn server + fetch).
- **Yang DIPROBE:** permukaan jaringan teknis yang ada di repo — `PUT /sessions/:id`, `GET /sessions?since=`, auth bearer + workspace header, LWW store file-per-session.
- **Yang TIDAK diprobe:** sinyal demand G1/G3 (tidak ada endpoint/instrumentasinya — konsisten dengan temuan audit `t_0e585af1`) dan invariant ADR-013/D8 (lihat batasan di bawah).

## Ringkasan

| Area | Hasil |
| --- | --- |
| Auth & validasi input (9 kasus) | Semua benar: 401 tanpa token, 403 workspace salah, 400 untuk id berbahaya/`..`/slash, payload kosong, tanggal bukan ISO, body bukan JSON, sessionId tak cocok |
| Double-submit 2 request concurrent identik | `stored = [true, false]`, **tepat satu rekam** tersimpan, keduanya HTTP 200 |
| Storm 50 concurrent, `updatedAt` identik | 1× `stored:true`, 49× `stored:false`, semua 200, wall 28,5 ms |
| LWW monotonic 50 concurrent capuran stempel | file akhir = stempel terbaru (monotonic ✓), wall 24,6 ms |
| Integritas state akhir | 105 file JSON, 0 `.tmp` tertinggal, 0 gagal parse, 0 field hilang (write-then-rename tahan concurrency) |
| Latency PUT 100× sekuensial (~405 KB/payload) | p50 **4,8 ms**, p95 **8,4 ms**, p99 **18,8 ms** |
| Latency GET penuh (105 rekam, ~43 MB respons) | p50 **355 ms**, p95 **1.565 ms**, max 1.565 ms (n=20) |
| Latency GET `since` (49 rekam, ~21 MB) | p50 **191 ms**, p95 **309 ms** (n=20) |

## Temuan 1 — MEDIUM (latent): perbandingan LWW peka format timestamp, bisa menolak tulisan lebih baru

`store.put` membandingkan `updatedAt` **sebagai string**, padahal kontrak menerima ISO timestamp apa pun yang `Date.parse` bisa baca:

- **Kasus terbukti (E2):** tulis `2026-08-28T15:00:00+07:00` (= 08:00Z), lalu tulisan yang lebih baru `2026-08-28T09:00:00Z` (= 09:00Z) → **ditolak** (`stored:false`, HTTP 200). File akhir memuat instan yang LEBIH LAMA. Tulisan lebih baru hilang **diam-diam** — klien yang kena ini percaya datanya sinkron.
- **Kasus minor (E1):** instan sama dengan presisi beda (`...T22:00:00.000Z` vs `...T22:00:00Z`) → `stored:true` (menimpa, seharusnya no-op).

**Status risiko saat ini: laten.** Klien referensi (`packages/meeting/src/sync.ts:93`) memakai `new Date().toISOString()` = selalu `Z` + milidetik, jadi aman hari ini. Tapi kontrak HTTP-nya menerima offset lain, dan importir/klien pihak ketiga yang menyerahkan format lokal akan kena kehilangan data senyap. **Perbaikan murah sebelum T0:** normalisasi ke instan (mis. bandingkan `Date.parse(...)`, atau wajibkan bentuk `Z` di `parseRecord` dan tolak selain itu dengan 400) + uji regresi kedua kasus di atas.

## Temuan 2 — PERF (jalur panas): `GET /sessions` full-scan seluruh arsip di tiap poll

`since()` membaca + `JSON.parse` **setiap file** di workspace per request, lalu memfilter dan menyerialisasi ulang semua yang lolos kursor. Terukur: 105 rekam × ~405 KB → p95 **1,56 s** dan respons ~43 MB **per poll penuh**; versi `since=` tetap 191–309 ms karena pemindaian filenya tetap terjadi. Klien melakukan poll berkala, jadi biaya ini tumbuh **linear terhadap ukuran total arsip**, bukan terhadap delta — dengan ribuan rapat (asumsi desain di komentar `store.ts` sendiri), poll tiap klien akan makin berat dan ini jalur yang mati lebih dulu saat adopsi naik. Beli waktu sekarang, bukan nanti: index sidecar `(updatedAt → file)` yang di-maintain saat `put`, atau respons delta `?since=` yang tak menyerialisasi ulang yang tak berubah.

## Bukti double-submit untuk gate UI (untuk @mas-reza)

Koreksi kriteria SEBELUM gate-nya jalan: kontrak sync-server **tidak punya idempotency-key dan tidak pernah membalas 409/422 untuk duplikat** — idempotensinya by-effect lewat LWW upsert. Pasangan concurrent identik terbukti: `[200, 200]`, `stored = [true, false]`, rekam di disk tepat satu. Jadi asersi end-to-end yang benar: **tepat satu `stored:true` + satu rekam tersimpan** — bukan "satunya 409". Kalau asersi 409 dipakai, gate akan FAIL palsu.

## Batasan & asumsi

1. Latency GET diukur n=20 (p99 = max, tidak stabil); PUT n=100. Semua localhost — angka absolut ini *lower bound*; pola dan perbandingan antar-scenario yang dipakai untuk kesimpulan.
2. Payload uji ~405 KB per rekam (bundle rapat sintetis); ukuran respons penuh ~43 MB pada 105 rekam.
3. **Invariant ADR-013/D8 belum bisa dinilai terhadap kode:** schema saat ini (`packages/store/src/schema.ts`) masih TEXT PK legacy tanpa UUIDv7/`session_key`/`external_refs` — ADR-013 selesai sebagai *keputusan* (dokumen ada di `docs/ADR/`), implementasinya belum mulai. Jangan menggugurkan verdict karena D8 "gagal" terhadap schema lama; itu bukan temuan, itu backlog implementasi.
4. Probe ini bukan pengganti sinyal demand G1/G3 — jalur itu tetap "belum dapat diputuskan" sesuai audit `demand-gate-audit-32-1.md`.

## Addendum — verifikasi pasca-patch (28 Agu, malam juga)

Patch kanonisasi (`parseRecord` → `toISOString()`) masuk working tree + 5 uji regresi di `server.test.ts` (blok "timestamp canonicalization"). Dist dibangun ulang dan kedua repro dijalankan ulang:

| Kasus | Pra-patch | Pasca-patch |
| --- | --- | --- |
| E2: push `09:00Z` lebih baru setelah `15:00+07:00` | `stored:false` (bug) | **`stored:true`**, file akhir `2026-08-28T09:00:00.000Z` |
| E1: instan sama, presisi beda | `stored:true` (salah) | **`stored:false`** (no-op yang benar) |
| G4 skrip UI gate Reza | `newerStored=false` | **`newerStored=true`, `bugReproduced=false`** |
| Auth 9/9 · storm50 1/49 · LWW monotonic · 105 file / 0 tmp / 0 korup | lolos | lolos (tidak berubah) |

`npm test`: 361/361 (28 file), termasuk 5 uji kanonisasi; `forgeguard gate --changed`: bersih di `packages/sync-server`. `t_c00e6296` dan `t_154f56d3` siap ditutup berbasis bukti (ForgeGuard task `dewi-tc00e6296` status **ready**).

## Reproduksi

```bash
node /tmp/dewi-probe.mjs   # spawn dist/server.js di port 8798, jalankan A–G, cetak hasil
```

(Copy skrip: `docs/reviews/probe-sync-server-2026-08-28.mjs`; rebuild dist dulu dengan `npm run build` bila `src` berubah.)
