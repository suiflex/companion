# UI Gate — mas-reza — 2026-08-28 (input verdict jalur teknis, t_5c12b5cd)

Basis: `develop@3bfe144` + working tree (uncommitted: `SummaryView.tsx` trigger exporter Obsidian,
`packages/exporters/*`, `packages/sync-server/src/store.ts` komentar batas). Build perintah Pak Dewi:
`npm run build` → `apps/extension/dist/`. Kontrak asersi sesuai koreksi mbak-dewi: server tidak
mengenal 409/422 — idempotensi by-effect via LWW upsert; asersi = tepat satu `stored:true` + satu
record di disk.

Repro: `node docs/reviews/ui-gate-masreza-2026-08-28.mjs` (spawn dist server, data dir sementara, auto-clean).

## U1 — Build & regresi: PASS
- `npm run build` (typecheck + 3 bundle): exit 0.
- `npm test`: **28 file, 361/361 passed**, 0 fail.

## U2 — Bundle budget (≤200 KB gzip initial): PASS
Artefak `index.html` + preload + CSS, digzip dari dist build (bukan angka build log):

| Artefak              | Raw (B)  | gzip (B) |
|----------------------|----------|----------|
| `app-DNh4voV2.js`    | 219.265  | 68.560   |
| `docgen-DbODeM74.js` (modulepreload) | 40.449 | 14.612 |
| `app-Bq2aHl94.css`   | 26.895   | 5.739    |
| **Initial total**    |          | **88.911** |

44% dari budget. Chunk berat (cytoscape 142 KB gz, mermaid.core 149 KB gz, cynefin 152 KB gz)
hanya dimuat via dynamic import saat ekspor PDF — tidak menyentuh jalur initial. sqlite wasm
(392 KB gz) adalah aset worker, bukan jalur initial.

## U3 — Kontrak double-submit concurrent, diverifikasi dari server: PASS
Server: dist `packages/sync-server/dist/server.js`, proses sungguhan, workspace `_personal` sementara.

- **G1 — 10 pasangan PUT identik concurrent** (fire bersamaan via `Promise.all`): 10/10 PASS.
  Semua pasangan `[200,200]`, `stored:[true,false]` (tepat satu), dan tepat satu file di disk
  dengan payload benar. 0 anomali.
- **G2 — Storm 25 concurrent, satu id**: `stored=true` = **1**, 24 × `false`, semua HTTP 200,
  file akhir utuh.
- **G3 — Retry setelah delay 150 ms** (pola double-tap jaringan lambat): PUT kedua `stored:false`
  → no-op, payload tersimpan tetap `"v1"`. Tidak ada rollback data.
- **G4 — Baseline LWW offset** (input kartu `t_c00e6296`, bukan blocker UI gate): push
  `2026-08-28T15:00:00+07:00` (= 08:00Z) lalu push lebih baru `09:00:00Z` → `stored:false`,
  file final bertahan string `+07:00`. **Bug string-compare tereproduksi end-to-end** —
  memperkuat temuan Dewi/arsitekno; perbaikan normalisasi ingest siap diverifikasi ulang dengan
  skrip yang sama.
- **G5 — Integritas state akhir**: 13/13 file sesuai ekspektasi, 0 `.tmp` tertinggal,
  0 file tak ter-parse, 0 record tanpa field wajib. Write-then-rename tahan.

## U4 — State coverage (audit kode + init render): PASS dengan catatan
- App shell: loading (`null` → skeleton sidebar), empty-state ("Belum ada meeting") dengan hint.
- SummaryView: done / processing (skeleton + `role="progressbar"` + jalur pemulihan >45 dtk) /
  error (`role="alert"` + tombol "Coba lagi") / empty + CTA — lengkap.
- Delete destructive selalu lewat `window.confirm` yang menyebut apa yang terhapus; feedback via
  toast `role="status" aria-live="polite"`; tombol regenerate terkunci saat `busy` (anti
  double-click di level UI, dan tetap aman di server per U3).
- Catatan: AskView / Transcript / DocGen belum saya bedah sedetail SummaryView (fokus gate: jalur
  sync + summary + shell). Tidak ditemukan pola render tanpa state error sejauh audit.

## U5 — Keyboard & aksesibilitas: PASS (statis), live pass menyusul
Semua kontrol native `button`/`input`/`select` (Enter/Space default benar), ⌘K/Ctrl-K palette
global, Enter/Escape di input rename, error pakai `role="alert"`, toast `aria-live`. App tidak
memakai modal custom — fokus trap tidak applicable. Render live di browser biasa terhalang guard
`chrome.*` (runtime message tidak tersedia di luar extension — desain yang benar, bukan bug);
keyboard pass penuh + console-clean via `load unpacked` butuh ±1 jam, saya antar menyusul tanpa
menggantung verdict (temuan statis tidak menunjukkan red flag).

## Verdict UI gate: **PASS WITH RISKS (kecil)**
Risiko tercatat: (1) LWW offset — tertangani `t_c00e6296` prasyarat T0, baseline repro tersedia;
(2) keyboard pass penuh menunggu lingkungan extension (±1 jam); (3) detail audit AskView/Transcript/
DocGen lebih dangkal dari SummaryView. Tidak ada blocker baru dari sisi UI.

Untuk kartu bloker audit (b): **trigger exporter UI + audit event sudah ada di working tree**
(`SummaryView.tsx` tombol "⬇ Obsidian" → `appendAudit(GATE_EVENT)`, komentar §32.1 probe) — tinggal
commit; pencatatan kutipan `ask.global` tetap giliran mbak-dewi sesuai usulan split mbak-laras.
