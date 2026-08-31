# Ask Engine v2 — Spesifikasi Kanonis

> **Constraint D1 (08-24 audit, unified D1):** Semua spesifikasi ini berlaku untuk
> `packages/{ai, meeting, store}` saja. Tidak ada dependensi ke desktop, bridge,
> sync, atau layanan eksternal.

**Status:** Tergantung sebagian oleh implementasi P0 yang sudah jalan di
`packages/ai/src/{ask,retrieval}.ts` dan `packages/meeting/src/globalask.ts`.
Spec ini mendokumentasikan bentuk kanonis yang _seharusnya_ ada, memperjelas
kontrak, dan memetakan celah (gap) antara kode saat ini dan tujuan produk.

---

## 1. Problem Statement

### 1.1 Masalah Produk

Ask saat ini dalam beberapa kasus mengembalikan:

```
"Tidak disebutkan dalam rapat."
```

padahal transcript mengandung pembahasan yang relevan — seringkali dalam
bentuk parsial atau implisit, bukan deklarasi eksplisit.

### 1.2 Penyebab Utama

| # | Penyebab | Status Selesainya |
|---|----------|------------------|
| 1 | Ask menggunakan context stuffing (transcript dipotong head-tail) | ✅ Dihapus (P0.10) |
| 2 | Tidak ada answerability classification | ✅ Terimplementasi (P0.5) |
| 3 | Prompt terlalu strict: hanya menerima jawaban eksplisit | ✅ Diperbaiki di `ASK_SYSTEM_PROMPT` |
| 4 | Retrieval belum berbasis conversation window | ✅ Terimplementasi (P0.8) |
| 5 | Evidence masih berupa citation yang dihasilkan model tanpa verifikasi | ✅ Terverifikasi via `verifyEvidence()` (P0.9) |
| 6 | Meeting session dan room identity belum dipisahkan | ✅ Terimplementasi di schema v1 |

### 1.3 Kasus Screenshot (Regresi Primer)

```text
Pertanyaan: "gimana caranya solusi dari beberapa aplikasi yang terdampak?"

Jawaban lama (SALAH): "Tidak disebutkan dalam rapat."

Jawaban target (BENAR):
"Belum ada keputusan final. Pembahasan mengarah ke dua opsi:
 solusi shared untuk semua aplikasi, atau implementasi terpisah per aplikasi."

Answerability: partial
Evidence: [E2, E3, E4]  →  Akbar + Widi discussion
Forbidden: Tidak disebutkan dalam rapat.
```

---

## 2. Arsitektur Ask Engine v2

### 2.1 Pipeline (satu pertanyaan)

```text
User Question
      │
      ▼
Intent Detection (query planner)
      │  LLM mengklasifikasi intent + mengekstrak keyword
      │  Fallback: regex-based heuristic jika LLM gagal
      ▼
Multi-Pass Lexical Retrieval (tanpa embedding)
      │  Pass 1: exact keywords (BM25)
      │  Pass 2: + related terms
      │  Pass 3: + full question, fuzzy matching
      │  Berhenti di pass pertama yang "cukup kuat"
      ▼
Conversation Window Expansion
      │  Setiap hit di-widen ±N turn
      │  Berhenti saat topic gap (≥90 detik)
      │  Window overlapping di-merge
      ▼
Budget Fit
      │  Small meeting: masuk seluruhnya (jika muat budget)
      │  Large meeting: drop span terendah sampai muat
      │  TIDAK PERNAH memotong tengah span
      ▼
LLM Reasoning
      │  Prompt berisi: transcript terverifikasi + ringkasan + history + pertanyaan
      │  Model membalas JSON: answer, answerability, evidence[], missing[], followUps[]
      ▼
Evidence Verification
      │  ID yang dikutip model dicek kebenarannya di transcript aktual
      │  ID palsu di-drop; "explicit" tanpa bukti → downgraded ke "inferred"
      ▼
Structured AskResult
```

### 2.2 Dua Mode

| Mode | Fungsi | Entry Point | Package |
|------|--------|-------------|---------|
| **Single-meeting Ask** | Menjawab tentang satu rapat | `askMeeting()` | `@meetcc/ai` |
| **Global Ask** | Menjawab dari beberapa rapat | `askMeetings()` | `@meetcc/meeting` |

Keduanya memakai pipeline di atas, namun Global Ask beroperasi di atas store
(CompanionStore) dengan retrieval lintas meeting.

### 2.3 Structured Meeting Memory sebagai Sumber Retrieval (roadmap §18)

Roadmap §18 (Structured Meeting Memory) menuntut knowledge rapat tersimpan
sebagai entity terstruktur — bukan vector. Di repo ini fondasi tersebut sudah
ada dan Ask v2 memperlakukannya sebagai sumber pengetahuan kedua di samping
transcript, bukan sebagai penggantinya.

**Entity dan tabel (schema migrasi 2, `packages/store/src/schema.ts`):**

| Entity roadmap §18 | Tabel | Catatan relasi |
|--------------------|-------|----------------|
| Participants | `participants` | PK `(session_id, name)`, jumlah `lines` per orang |
| Topics | `analyses` (JSON) → `timeline`, `keyDiscussions` | Ringkasan per session, bukan tabel topik terpisah |
| Decisions | `decisions` | `topic`, `decision`, `reason`, `rejected`, `confidence`, `superseded_by` → memenuhi relasi `DECIDED_IN` / `SUPERSEDES` |
| Action Items | `action_items` | `owner`, `due_at`, `status`, `external_ref` → memenuhi `ASSIGNED_TO` / `CREATED_IN` |
| Open Questions | `open_questions` | `status`, `resolved_in`; `OPENED_IN` diwakili `session_id` baris itu sendiri → memenuhi `OPENED_IN` / `RESOLVED_IN` |
| Risks | `risks` | Satu baris per risk per session |
| Evidence | `evidence_refs` | `(entity_type, entity_id) → transcript_entries(id)` → memenuhi `REFERENCES → Transcript Entry` |
| Applications / Systems | Belum ada tabel khusus | Tertutup oleh keyword extraction di planner (§3); ekstraksi entity aplikasi eksplisit = future scope |

`SUPERSEDES` dibaca lewat self-reference `decisions.superseded_by`; graph
query tidak dibutuhkan — SQLite relational cukup, sesuai keputusan roadmap §18.

**Permukaan pencarian:** semua entity diprojeksi ke `memory_fts`
(`kind, session_id, entity_id, text`), disinkronkan oleh repository (bukan
trigger, karena baris berasal dari beberapa tabel). `store.search()` membaca
indeks ini bersama transcript FTS dalam satu query.

**Peran memori di pipeline Ask:**

- **Single-meeting Ask** (`askMeeting()`): sumber utama tetap transcript
  via multi-pass retrieval (§4) + conversation window (§5); prompt menerima
  `Analysis.executiveSummary` sebagai konteks (`analysis: Analysis | null`,
  dipakai di `buildAskPrompt`). Entity terstruktur per-session (decisions,
  actionItems, openQuestions) adalah kandidat konteks tambahan — belum masuk
  prompt saat ini; kena gap di §13 bila dianggap wajib. Tabel memori tidak
  diquery langsung pada mode ini.
- **Global Ask** (`askMeetings()`): retrieval berjalan lewat
  `collectGlobalEvidence()` — `store.search()` menembak `memory_fts` dan
  transcript FTS sekaligus (lintas session); hit entity dengan `kind`
  `decision` / `action` / `question` di-resolve ke tabel asalnya
  (`decisions` / `action_items` / `open_questions`), lalu setiap baris entity
  di-translate ke entry transcript via `evidence_refs` (`store.evidenceFor()`).
  Entry hasil translate di-expand ±`GLOBAL_WINDOW` (3) turn per session,
  dibatasi `MAX_SOURCE_MEETINGS` (6). Ekspansi ini adalah varian sederhana
  dari window §5 (fixed ±3, tanpa merge gap 90 detik); jawaban lintas rapat
  tetap wajib membawa evidence entry-ID dari transcript (§6), tidak pernah
  hanya id baris memory_fts.

**Batas (D1):** semua tabel dan indeks di atas hidup di
`packages/store`; pembacaan memori terjadi di `packages/meeting`
(globalask) dan `packages/ai`. Tidak ada dependensi desktop/bridge/sync.

---

## 3. Intent Detection (Query Planner)

### 3.1 Input → Output

```text
Input:  pertanyaan user (teks bebas)
Output: QueryPlan { intent, keywords, relatedTerms }
```

### 3.2 Intent Klasifikasi

| Intent | Deskripsi | Contoh Pertanyaan |
|--------|-----------|------------------|
| `recall` | Mencari fakta yang disebut langsung | "Deadline kapan?" |
| `explain` | Mencari alasan / penjelasan | "Kenapa opsi itu dipilih?" |
| `analyze` | Meminta kesimpulan dari pembahasan | "Apa masalah utamanya?" |
| `advise` | Meminta saran / rekomendasi (AI) | "Menurutmu sebaiknya bagaimana?" |

Untuk `advise`, UI **wajib** membedakan secara visual antara:
- Isi rapat (grounded evidence)
- Rekomendasi Companion (AI reasoning, bukan dari rapat)

### 3.3 Prompt Planner

```text
Sistem prompt: PLANNER_SYSTEM_PROMPT (packages/ai/src/ask.ts baris 34-43)
Output format: JSON { intent, keywords[≤8], relatedTerms[≤8] }
Fallback: regex-based via fallbackPlan()
```

**Fallback rules** (saat LLM gagal):

| Pola regex | Intent terdekat |
|------------|----------------|
| `/saran\|sebaiknya\|menurut\|rekomendasi\|advis/` | `advise` |
| `/kenapa\|mengapa\|alasan\|why/` | `explain` |
| `/analisa\|analisis\|masalah utama\|kesimpulan\|rangkum/` | `analyze` |
| (lainnya) | `recall` |

### 3.4 Konsultan

- `keywords` dan `relatedTerms` dikirim dalam **bahasa yang sama dengan pertanyaan**.
- Jika model mengembalikan keyword kosong → fallback ke tokenisasi pertanyaan asli.
- Jika intent tidak dikenal → default ke `recall`.

---

## 4. Multi-Pass Lexical Retrieval

### 4.1 Prinsip

Pertanyaan rapat umumnya mengandung sinyal leksikal kuat: nama orang, aplikasi,
keputusan, tanggal, topik. Karena itu BM25 + phrase matching + speaker matching
sudah cukup tanpa embedding (roadmap §4).

### 4.2 Tiga Pass

```text
PASS 1: keywords saja (exact token BM25)
   ↓  jika jumlah hits < MIN_HITS (3) dan tidak mencakup ≥20% transcript
PASS 2: keywords + related terms (exact token BM25)
   ↓  jika masih lemah
PASS 3: keywords + related terms + full question text (fuzzy BM25)
```

**Threshold "lemah":**

```typescript
// retrieval.ts
MIN_HITS = 3;
// kecuali pada transcript pendek, di mana 20% dari total sudah cukup:
function enoughHits(hits: number, total: number): boolean {
  return hits >= MIN_HITS || (hits > 0 && hits >= Math.ceil(total * 0.2));
}
```

### 4.3 Scoring: BM25 + Boost

| Komponen | Bobot | Keterangan |
|----------|-------|-----------|
| BM25 exact token | 1.0 × IDF | Standard BM25 (K1=1.5, B=0.75) |
| BM25 fuzzy prefix | 0.6 × IDF | Hanya jika term ≥4 karakter, 0.5× tf boost |
| Phrase match (full question di entry) | +4 | Pertanyaan panjang (>8 char) yang muncul utuh |
| Exact substring match | +4 | Pertanyaan >12 char yang ter-include di entry |
| Speaker name match | +1.5 | Token nama speaker muncul di pertanyaan |

### 4.4 Stopword

Stopword dibagi menjadi dua kelompok:
- **Bahasa Indonesia:** yang, di, ke, dari, dan, atau, untuk, pada, dengan, ...
- **Bahasa Inggris:** the, a, an, of, to, in, for, on, with, is, are, ...

Stopword dikecualikan dari indexing **dan** dari scoring BM25: `tokenize()`
(retrieval.ts:25-31) memfilter stopword, dan `buildIndex()`
(retrieval.ts:39-47) mengindeks dokumen lewat `tokenize()`, sehingga stopword
tidak pernah masuk indeks maupun perhitungan skor.

---

## 5. Conversation Window Retrieval

### 5.1 Expand

Setiap hit di-expand ke turn sekitarnya:

```typescript
WINDOW_TURNS = 4;           // ±4 turn dari hit
SEGMENT_GAP_MS = 90_000;    // berhenti jika gap waktu ≥90 detik
```

### 5.2 Merge

Window overlapping atau bersebelahan di-merge, mempertahankan skor tertinggi:

```text
Span A: [10, 16]  score: 5.2
Span B: [14, 20]  score: 4.8
→ merged: [10, 20]  score: 5.2
```

### 5.3 Budget Fit

Untuk transcript panjang, span dengan skor terendah di-drop satu per satu
sampai rendered text muat dalam budget (default 60.000 karakter).

**Aturan mutlak:** Tidak pernah memotong bagian tengah dari sebuah span yang
tetap dipertahankan.

---

## 6. Entry ID dan Evidence Terverifikasi

### 6.1 Stable IDs

Setiap transcript entry memiliki ID stabil dalam format `E1`, `E2`, ..., `EN`,
dihasilkan oleh `entryId(index)` (packages/shared). ID ini:

- Dijamin unik dalam satu meeting
- Ditampilkan ke model dalam format `[E12][14:47] Akbar: ...`
- Diekstrak model ke array `evidence: ["E12", "E13"]`
- Diverifikasi ulang oleh `verifyEvidence()` sebelum sampai ke UI

### 6.2 Verifikasi Evidence

```typescript
// packages/ai/src/ask.ts — verifyEvidence()

1. Parse semua ID yang diklaim model (bentuk array string, array objek, atau prose)
2. Cek setiap ID terhadap transcript entries aktual
3. ID yang tidak ada → di-drop tanpa error
4. ID yang ada → dikelompokkan menjadi EvidenceSpan:
   - entryIds[]: ID berurutan yang overlap
   - startTime / endTime: waktu asli dari transcript (bukan dari model)
   - speakers[]: daftar unik pembicara
   - preview: 160 karakter pertama
```

### 6.3 Downgrade Rule

Jika model mengklaim `answerability: "explicit"` tetapi **tidak ada** ID
yang lolos verifikasi → downgrade otomatis ke `"inferred"`.

Jika tidak ada evidence sama sekali dan answerability bukan `not_found` →
confidence di-cap maksimum 0.4.

### 6.4 Anti-Hallucination

Model dilarang mengarang:
- ID baris yang tidak ada di transcript
- Timestamp yang tidak sesuai (waktu diambil dari transcript, bukan dari model)
- Nama pembicara yang tidak ada
- Fakta yang tidak ada di transcript

---

## 7. Answerability Classification (4 Gradasi)

Ini adalah salah satu perubahan paling penting dari Ask v1.

| Grade | Definisi | Contoh | UI Indikator |
|-------|----------|--------|--------------|
| **explicit** | Jawaban dinyatakan langsung, ada baris spesifik | "Kita putuskan shared service." | ✅ Explicit |
| **partial** | Topik dibahas tetapi belum tuntas/belum diputuskan | Diskusi dua opsi, belum final | ⚠️ Partial — ada pembahasan |
| **inferred** | Jawaban tidak dinyatakan langsung, tetapi bisa disimpulkan | A: "existing bisa dipakai", B: "jadi tidak perlu baru?", A: "iya" | 🔍 Inferred from discussion |
| **not_found** | Benar-benar tidak ada baris yang relevan setelah retrieval | "Berapa node kubernetes?" → tidak ada yang membahas | ❌ Not mentioned |

### 7.1 Aturan Prompt (ASK_SYSTEM_PROMPT)

```text
Dilarang menjawab "Tidak disebutkan dalam rapat." ketika masih ada
pembahasan yang berkaitan; gunakan partial atau inferred dan jelaskan
sejauh mana rapat membahasnya.

"evidence" wajib berisi ID yang benar-benar ada pada transcript di atas.
```

### 7.2 Default Confidence per Grade

```typescript
DEFAULT_CONFIDENCE = {
  explicit: 0.9,
  partial:  0.6,
  inferred: 0.5,
  not_found: 0.2,
};
```

### 7.3 Global Ask

Global Ask memakai 4 gradasi yang sama, dengan prompt tambahan:

> Susun kronologi bila keputusan berubah antar rapat.

---

## 8. Structured Ask Result (Kontrak Data)

```typescript
interface AskResult {
  answer: string;

  answerability: 'explicit' | 'partial' | 'inferred' | 'not_found';

  intent: 'recall' | 'explain' | 'analyze' | 'advise';

  confidence: number;  // 0..1

  evidence: EvidenceSpan[];

  missing: string[];   // hal penting yang belum diputuskan/disebut

  followUps: string[]; // maks. 3 pertanyaan lanjutan yang berguna
}

interface EvidenceSpan {
  entryIds: string[];   // ["E12", "E13"] — id baris yang mendukung
  startTime: string;    // ISO timestamp dari transcript
  endTime: string;
  speakers: string[];
  preview: string;      // ≤160 karakter pertama
}
```

---

## 9. Boundary Constraints (D1)

### 9.1 In Scope

```text
packages/ai/src/ask.ts          — planner, prompt, parse, verify
packages/ai/src/retrieval.ts    — BM25, windows, budget, rendering
packages/ai/src/clean.ts        — transcript cleanup (bukan Ask, tapi di AI package)
packages/meeting/src/globalask.ts — global ask pipeline
packages/store/src/schema.ts    — schema FTS + structured memory
packages/shared/src/types.ts    — AskResult, EvidenceSpan, Entry
```

### 9.2 Explicitly Out of Scope untuk Spesifikasi Ini

- UI rendering dari AskResult
- Desktop vault / Tauri app
- Server sync / cloud
- Bridge / native messaging
- Export / MCP exposure
- AI provider selection logic

### 9.3 Interface Contract

Callers (UI, background service worker) berinteraksi melalui:

```typescript
// Single meeting
askMeeting(client, meeting, analysis, history, question): Promise<AskResult>
askTranscript(client, meeting, analysis, history, question): Promise<string>

// Global (cross-meeting)
askMeetings(client, store, question): Promise<GlobalAskResult>

interface GlobalAskResult extends AskResult {
  sessions: { id: string; title: string; startedAt: string | null }[];
}
```

---

## 10. Audit: Status Implementasi vs Spesifikasi

| Fitur | Spec | Kode | Gap |
|-------|------|------|-----|
| Query Planner (LLM + fallback) | §3 | ✅ `planQuery()`, `fallbackPlan()`, `parsePlan()` | — |
| Multi-pass retrieval | §4 | ✅ `retrieve()` 3-pass | — |
| Conversation window | §5 | ✅ `expandWindow()`, `mergeSpans()` | — |
| Budget fit (tanpa truncation tengah) | §5.3 | ✅ `fitBudget()` + `selectContext()` | — |
| Stable entry IDs | §6.1 | ✅ `entryId()`, `withEntryIds()` | — |
| Evidence verification | §6.2 | ✅ `verifyEvidence()` | — |
| Anti-hallucination downgrade | §6.3 | ✅ di `parseAskResult()` | — |
| 4-grad answerability | §7 | ✅ di `parseAskResult()` | — |
| `ASK_SYSTEM_PROMPT` larangan refusal | §7.1 | ✅ di prompt | — |
| Structured AskResult | §8 | ✅ `@meetcc/shared` types | — |
| Global Ask pipeline | §2.2 | ✅ `askMeetings()` | — |
| Structured memory sebagai sumber retrieval (roadmap §18) | §2.3 | ✅ tabel + `memory_fts` + `evidenceFor()` | Entity Applications/Systems belum diekstraksi eksplisit |
| **Evaluation suite (15 kategori)** | §11 | ⚠️ 6 dari 15 kategori di `askeval.test.ts` | **9 kategori belum ada** |
| `meeting-shared-solution.json` fixture | §11.1 | ⚠️ Ada sebagai inline const di `askeval.test.ts` | Belum file fixture terpisah |
| Contradiction handling | §11.11 | ❌ | Belum ada kasus uji |
| Changed decision chronology | §11.12 | ❌ | Belum ada kasus uji |
| Reused meeting room (roomId ≠ sessionId) | §11.13 | ❌ | Belum ada kasus uji |
| Concurrent meetings | §11.14 | ❌ | Belum ada kasus uji |
| Cleaned vs raw transcript retrieval | §11.15 | ❌ | Belum ada kasus uji |
| Pronoun/coreference | §11.9 | ❌ | Belum ada kasus uji |

---

## 11. Evaluation Suite — 15 Kategori

Evaluation suite adalah regresi wajib untuk Ask Engine v2.
Setiap kategori memiliki: deskripsi, fixture/entry, pertanyaan, expected
answerability, mustMention, dan forbidden.

---

### 11.1 Kategori 1: Explicit Answer

**Tujuan:** Jawaban eksplisit ada di transcript sebagai pernyataan langsung.

```json
{
  "id": "eval-01-explicit",
  "entries": [
    { "speaker": "Akbar", "text": "Kita putuskan semua aplikasi pakai shared service.", "offset": 0 },
    { "speaker": "Widi",  "text": "Oke, shared service untuk semua.",                  "offset": 40 }
  ],
  "question": "Apa keputusan tentang service untuk aplikasi?",
  "expected": {
    "answerability": "explicit",
    "mustMention": ["shared service", "keputusan"],
    "forbidden": ["Tidak disebutkan dalam rapat"]
  }
}
```

---

### 11.2 Kategori 2: Partial Answer (Kasus Screenshot)

**Tujuan:** Topik dibahas tetapi belum tuntas — ini adalah regresi primer.

**Fixture:** `meeting-shared-solution.json` (inline di bawah, untuk referensi)

```json
{
  "id": "eval-02-partial",
  "entries": [
    { "speaker": "Rina",  "text": "Kita mulai dari status insiden kemarin",                         "offset": 0 },
    { "speaker": "Akbar", "text": "Ada beberapa aplikasi yang terdampak, bukan cuma satu",           "offset": 40 },
    { "speaker": "Widi",  "text": "Solusinya nanti dishare untuk semua aplikasi atau dibuat terpisah per aplikasi?", "offset": 70 },
    { "speaker": "Akbar", "text": "Dua-duanya masih dipertimbangkan, belum ada keputusan final",     "offset": 100 },
    { "speaker": "Rina",  "text": "Oke, kita bahas lagi minggu depan setelah data lengkap",          "offset": 130 }
  ],
  "question": "gimana caranya solusi dari beberapa aplikasi yang terdampak?",
  "expected": {
    "answerability": "partial",
    "mustMention": ["belum ada keputusan final", "shared", "terpisah"],
    "forbidden": ["Tidak disebutkan dalam rapat"]
  }
}
```

---

### 11.3 Kategori 3: Inferred Answer

**Tujuan:** Jawaban tidak dinyatakan langsung, tetapi dapat disimpulkan dari
rangkaian percakapan lintas turn.

```json
{
  "id": "eval-03-inferred",
  "entries": [
    { "speaker": "Akbar", "text": "Service existing masih bisa dipakai",     "offset": 0 },
    { "speaker": "Widi",  "text": "Jadi tidak perlu service baru?",          "offset": 20 },
    { "speaker": "Akbar", "text": "Iya, pakai existing saja",                "offset": 40 }
  ],
  "question": "Apakah tim memutuskan untuk membuat service baru?",
  "expected": {
    "answerability": "inferred",
    "mustMention": ["existing", "tidak perlu"],
    "forbidden": ["Tidak disebutkan dalam rapat"]
  }
}
```

---

### 11.4 Kategori 4: Truly Not Found

**Tujuan:** Tidak ada satu pun baris yang relevan dengan pertanyaan.

```json
{
  "id": "eval-04-not-found",
  "entries": [
    { "speaker": "Rina",  "text": "Deadline rilis Jumat depan",  "offset": 0 },
    { "speaker": "Manan", "text": "Siap, saya kerjakan",         "offset": 20 }
  ],
  "question": "Berapa node Kubernetes yang kita pakai?",
  "expected": {
    "answerability": "not_found",
    "mustMention": [],
    "forbidden": ["Tidak disebutkan dalam rapat"],
    "notes": "Jawaban 'not_found' boleh berbentuk 'Tidak ada bagian rapat yang membahas hal ini' — bukan penolakan refusional."
  }
}
```

---

### 11.5 Kategori 5: Cross-Turn Answer

**Tujuan:** Jawaban tersebar di beberapa turn oleh pembicara berbeda;
retrieval harus mengambil seluruh rangkaian, bukan satu baris saja.

```json
{
  "id": "eval-05-cross-turn",
  "entries": [
    { "speaker": "Gunawan", "text": "Arsitektur microservice sudah final",       "offset": 0 },
    { "speaker": "Akbar",   "text": "Tapi untuk Freeport kita pakai monolith dulu", "offset": 30 },
    { "speaker": "Widi",    "text": "Jadi Freeport bukan microservice?",         "offset": 60 },
    { "speaker": "Akbar",   "text": "Betul, monolith untuk fase pertama",        "offset": 90 }
  ],
  "question": "Bagaimana arsitektur untuk Freeport?",
  "expected": {
    "answerability": "inferred",
    "mustMention": ["monolith", "fase pertama"],
    "forbidden": ["Tidak disebutkan dalam rapat"],
    "notes": "Jawaban harus mencakup konteks dari Gunawan (general) + Akbar (Freeport-specific)"
  }
}
```

---

### 11.6 Kategori 6: Long Transcript

**Tujuan:** Meeting panjang tidak boleh kehilangan bagian tengah karena
truncation. Retrieval harus menemukan diskusi di tengah-tengah.

```json
{
  "id": "eval-06-long-transcript",
  "entries": [
    "... 400 baris pembukaan rutin (offset 0-4000 detik) ...",
    { "speaker": "Akbar", "text": "Ada beberapa aplikasi yang terdampak", "offset": 4000 },
    { "speaker": "Widi",  "text": "Solusinya shared atau terpisah?",       "offset": 4020 },
    "... 400 baris penutup administrasi (offset 5000-9000 detik) ..."
  ],
  "question": "gimana caranya solusi dari beberapa aplikasi yang terdampak?",
  "expected": {
    "answerability": "partial",
    "mustMention": ["aplikasi yang terdampak", "shared", "terpisah"],
    "forbidden": ["pembukaan dan laporan rutin bagian 0", "penutup dan administrasi bagian 399"],
    "notes": "Prompt ke model TIDAK boleh berisi filler head/tail; hanya bagian relevan."
  }
}
```

---

### 11.7 Kategori 7: Middle-of-Transcript Retrieval

**Tujuan:** Verifikasi bahwa retrieval benar-benar menjangkau turn tengah,
bukan hanya ujung awal/akhir.

```json
{
  "id": "eval-07-middle-retrieval",
  "entries": [
    "... 400 baris pembukaan (offset 0-4000 detik) ...",
    { "speaker": "Rina",  "text": "Status insiden kemarin",    "offset": 4000 },
    { "speaker": "Akbar", "text": "Terdampak beberapa aplikasi", "offset": 4020 },
    "... 400 baris penutup (offset 5000-9000 detik) ..."
  ],
  "question": "apa status insiden kemarin?",
  "expected": {
    "answerability": "explicit",
    "mustMention": ["insiden"],
    "forbidden": ["pembukaan dan laporan rutin bagian 0"],
    "notes": "Covered span harus include indeks sekitar 400-401 (baris tengah)."
  }
}
```

---

### 11.8 Kategori 8: Speaker Reference

**Tujuan:** Pertanyaan yang menyebut nama pembicara harus menarik turn
dari pembicara tersebut.

```json
{
  "id": "eval-08-speaker-ref",
  "entries": [
    { "speaker": "Akbar", "text": "Service existing masih bisa dipakai",  "offset": 0 },
    { "speaker": "Widi",  "text": "Oke noted",                            "offset": 20 },
    { "speaker": "Akbar", "text": "Deploy ke production minggu depan",     "offset": 40 }
  ],
  "question": "Apa kata Akbar tentang deployment?",
  "expected": {
    "answerability": "explicit",
    "mustMention": ["production", "minggu depan"],
    "forbidden": ["Tidak disebutkan dalam rapat"],
    "notes": "Retrieval harus menangkap baris Akbar, bukan hanya Widi."
  }
}
```

---

### 11.9 Kategori 9: Pronoun/Coreference

**Tujuan:** Pertanyaan dengan kata ganti (dia, itu, yang tadi) harus tetap
menemukan referensi yang tepat berdasarkan konteks percakapan.

```json
{
  "id": "eval-09-pronoun",
  "entries": [
    { "speaker": "Rina",  "text": "Freeport minta timeline dipercepat",       "offset": 0 },
    { "speaker": "Akbar", "text": "Oke, kita coba skip phase testing",        "offset": 30 },
    { "speaker": "Widi",  "text": "Kalau skip testing, risikonya tinggi",     "offset": 60 },
    { "speaker": "Rina",  "text": "Iya, tapi mereka sudah menunggu lama",     "offset": 90 }
  ],
  "question": "Siapa yang meminta itu dipercepat?",
  "expected": {
    "answerability": "explicit",
    "mustMention": ["Freeport"],
    "forbidden": ["Tidak disebutkan dalam rapat"],
    "notes": "'itu' merujuk ke 'timeline'; 'Freeport' adalah pihak yang meminta."
  }
}
```

---

### 11.10 Kategori 10: Follow-Up Question

**Tujuan:** Pertanyaan lanjutan yang bergantung pada konteks percakapan
sebelumnya harus tetap menemukan jawaban berdasarkan history.

```json
{
  "id": "eval-10-followup",
  "history": [
    { "role": "user",      "content": "Apa keputusan tentang payment gateway?" },
    { "role": "assistant", "content": "Tim memutuskan menggunakan Midtrans." }
  ],
  "entries": [
    { "speaker": "Akbar", "text": "Midtrans sudah terintegrasi",         "offset": 0 },
    { "speaker": "Widi",  "text": "Fee-nya 2.5% per transaksi",          "offset": 30 },
    { "speaker": "Akbar", "text": "Oke kita proceed dengan Midtrans",    "offset": 60 }
  ],
  "question": "Berapa fee-nya?",
  "expected": {
    "answerability": "explicit",
    "mustMention": ["2.5%", "transaksi"],
    "forbidden": ["Tidak disebutkan dalam rapat"],
    "notes": "'fee-nya' merujuk ke Midtrans; harus ditemukan via konteks history + retrieval."
  }
}
```

---

### 11.11 Kategori 11: Contradictory Statements

**Tujuan:** Ketika dua pembicara menyatakan hal yang berlawanan, AI harus
mengenali kontradiksi dan menjelaskan posisi masing-masing, bukan memilih
salah satu tanpa penjelasan.

```json
{
  "id": "eval-11-contradiction",
  "entries": [
    { "speaker": "Akbar", "text": "Kita harus pakai microservice untuk semua",  "offset": 0 },
    { "speaker": "Widi",  "text": "Menurutku monolith lebih cocok untuk tim kecil", "offset": 30 },
    { "speaker": "Akbar", "text": "Tapi kita butuh scalability",               "offset": 60 },
    { "speaker": "Widi",  "text": "Scale-nya belum sebesar itu untuk sekarang",  "offset": 90 }
  ],
  "question": "Apa keputusan arsitektur yang diambil?",
  "expected": {
    "answerability": "partial",
    "mustMention": ["microservice", "monolith", "belum", "diputuskan"],
    "forbidden": ["Tidak disebutkan dalam rapat"],
    "notes": "Jawaban harus menunjukkan kedua posisi dan menyatakan belum final."
  }
}
```

---

### 11.12 Kategori 12: Changed Decision (Chronology)

**Tujuan:** Ketika keputusan berubah seiring waktu (misalnya dari meeting ke
meeting), AI harus menyusun kronologi perubahan.

```json
{
  "id": "eval-12-changed-decision",
  "entries": [
    { "speaker": "Akbar", "text": "Untuk sekarang kita pakai kubernetes",       "offset": 0 },
    { "speaker": "Widi",  "text": "Oke, kubernetes untuk fase pertama",         "offset": 30 },
    { "speaker": "Rina",  "text": "Update: ternyata Docker Compose lebih cocok untuk MVP", "offset": 4000 },
    { "speaker": "Akbar", "text": "Ya, kita switch ke Docker Compose dulu",     "offset": 4030 }
  ],
  "question": "Bagaimana evolusi keputusan deployment?",
  "expected": {
    "answerability": "inferred",
    "mustMention": ["kubernetes", "docker compose", "switch"],
    "forbidden": ["Tidak disebutkan dalam rapat"],
    "notes": "Jawaban harus menunjukkan kronologi: kubernetes → docker compose."
  }
}
```

---

### 11.13 Kategori 13: Reused Meeting Room (Room ID ≠ Session ID)

**Tujuan:** Ruang meeting yang sama (Google Meet code) digunakan untuk
beberapa meeting berbeda. AI tidak boleh mencampuradukkan konten dari
meeting-room yang sama tapi session berbeda.

```json
{
  "id": "eval-13-reused-room",
  "context": {
    "room_id": "xdr-fdbe-zqz",
    "sessions": [
      {
        "session_id": "session-monday",
        "title": "Monday standup",
        "started_at": "2026-08-25T07:00:00Z",
        "entries": [
          { "speaker": "Akbar", "text": "Deploy ke staging hari ini", "offset": 0 }
        ]
      },
      {
        "session_id": "session-wednesday",
        "title": "Wednesday standup",
        "started_at": "2026-08-27T07:00:00Z",
        "entries": [
          { "speaker": "Widi",  "text": "Deploy ke production besok", "offset": 0 }
        ]
      }
    ]
  },
  "question": "Kapan deploy ke production?",
  "expected": {
    "answerability": "explicit",
    "mustMention": ["besok", "wednesday"],
    "forbidden": ["staging"],
    "notes": "Hanya session Wednesday yang relevan; Monday (staging) bukan jawaban."
  },
  "notes": "Test ini hanya berlaku untuk Global Ask; single-meeting Ask tidak terpengaruh."
}
```

---

### 11.14 Kategori 14: Multiple Concurrent Meetings

**Tujuan:** Ketika user bertanya tentang dua topik dari dua meeting yang
berbeda, AI harus menarik evidence dari kedua meeting secara terpisah dan
menyintesis jawaban dengan referensi meeting yang jelas.

```json
{
  "id": "eval-14-concurrent",
  "context": {
    "sessions": [
      {
        "session_id": "meeting-alpha",
        "title": "Alpha Team — Payment",
        "started_at": "2026-08-25T09:00:00Z",
        "entries": [
          { "speaker": "Akbar", "text": "Payment gateway pakai Midtrans", "offset": 0 }
        ]
      },
      {
        "session_id": "meeting-beta",
        "title": "Beta Team — Auth",
        "started_at": "2026-08-25T10:00:00Z",
        "entries": [
          { "speaker": "Widi", "text": "Auth pakai Auth0", "offset": 0 }
        ]
      }
    ]
  },
  "question": "Apa keputusan teknis dari kedua team hari ini?",
  "expected": {
    "answerability": "explicit",
    "mustMention": ["Midtrans", "Auth0"],
    "forbidden": ["Tidak disebutkan dalam rapat"],
    "notes": "Jawaban harus merujuk meeting mana yang menyebut apa."
  },
  "notes": "Test ini hanya berlaku untuk Global Ask."
}
```

---

### 11.15 Kategori 15: Cleaned vs Raw Transcript

**Tujuan:** Ketika transcript sudah di-cleanup (fix ASR errors), retrieval
harus tetap menemukan konten yang benar berdasarkan cleaned text, bukan
text yang salah sebelum cleanup.

```json
{
  "id": "eval-15-cleaned-transcript",
  "entries_raw": [
    { "speaker": "Akbar", "text": "Target tahun 2003 harus tercapai", "offset": 0 },
    { "speaker": "Widi",  "text": "Oke noted",                        "offset": 30 }
  ],
  "entries_cleaned": [
    { "speaker": "Akbar", "text": "Target tahun 2023 harus tercapai", "offset": 0 },
    { "speaker": "Widi",  "text": "Oke noted",                        "offset": 30 }
  ],
  "question": "Apa target tahun yang disebutkan?",
  "expected": {
    "answerability": "explicit",
    "mustMention": ["2023"],
    "forbidden": ["2003"],
    "notes": "Retrieval dan jawaban harus berdasarkan cleaned transcript, bukan raw. UI boleh menampilkan provenance cleanup (raw vs cleaned)."
  }
}
```

---

## 12. Kasus Uji — Ringkasan

| # | Kategori | ID Fixture | Mode | Answerability |
|---|----------|-----------|------|---------------|
| 1 | Explicit answer | `eval-01-explicit` | single | explicit |
| 2 | Partial answer (screenshot) | `eval-02-partial` | single | partial |
| 3 | Inferred answer | `eval-03-inferred` | single | inferred |
| 4 | Truly not found | `eval-04-not-found` | single | not_found |
| 5 | Cross-turn answer | `eval-05-cross-turn` | single | inferred |
| 6 | Long transcript | `eval-06-long-transcript` | single | partial |
| 7 | Middle retrieval | `eval-07-middle-retrieval` | single | explicit |
| 8 | Speaker reference | `eval-08-speaker-ref` | single | explicit |
| 9 | Pronoun/coreference | `eval-09-pronoun` | single | explicit |
| 10 | Follow-up question | `eval-10-followup` | single | explicit |
| 11 | Contradiction | `eval-11-contradiction` | single | partial |
| 12 | Changed decision | `eval-12-changed-decision` | single | inferred |
| 13 | Reused room | `eval-13-reused-room` | global | explicit |
| 14 | Concurrent meetings | `eval-14-concurrent` | global | explicit |
| 15 | Cleaned vs raw | `eval-15-cleaned-transcript` | single | explicit |

---

## 13. Open Gaps & Rekomendasi

### 13.1 Harus Diselesaikan Sebelum General Availability

| Gap | Prioritas | Keterangan |
|-----|-----------|------------|
| Evaluasi suite hanya 6 dari 15 kategori | P0 | Buat file fixture terpisah `meeting-shared-solution.json` + 14 fixture lainnya; tambahkan test di `askeval.test.ts` |
| Contradiction & changed-decision handling | P1 | Prompt tidak secara eksplisit memandu model cara menangani kontradiksi; perlu eksperimen prompt |
| Cleaned vs raw routing | P1 | Saat ini `selectContext` hanya melihat entries dari satu variant; perlu kejelasan apakah cleaned variant dipilih otomatis |

### 13.2 Nice-to-Have (Future)

| Item | Keterangan |
|------|-----------|
| Dynamic WINDOW_TURNS berdasarkan intent | Analyze bisa pakai window lebih lebar |
| Intent-specific prompt variants | Recall lebih ketat; advise lebih terbuka |
| Confidence calibration via eval suite | Run eval suite → perbaiki prompt → ukur delta |

---

## 14. Definisi Selesai (Definition of Done)

Spec ini dianggap **final** ketika:

- [ ] Semua 15 kategori evaluasi memiliki fixture JSON terpisah di repo
- [ ] Setiap fixture diujikan di `askeval.test.ts` dengan assertions lengkap
- [ ] `meeting-shared-solution.json` tersedia sebagai file standalone (bukan inline const)
- [ ] Semua test lulus: `npm test` (packages/ai, packages/meeting)
- [ ] Tidak ada perubahan kode di luar `packages/{ai,meeting,store}` (constraint D1)
- [ ] Audit gap di §10 diperbarui jika kode berubah

---

## 15. Referensi

| Dokumen | Status | Keterangan |
|---------|--------|-----------|
| `docs/06-roadmap.md` | **Roadmap aktif** | Urutan dan gate produk |
| `docs/companion-product-architecture-roadmap.md` §9–§18, §31 | Referensi historis | Input awal spec, 24 Agustus 2026 |
| `docs/COMPANION_UNIFIED_ARCHITECTURE.md` §D1, §32 | Referensi arsitektur | Arsitektur teraudit |
| `packages/ai/src/ask.ts` | Implementasi aktual | Single-meeting ask |
| `packages/ai/src/retrieval.ts` | Implementasi aktual | BM25, windows, budget |
| `packages/ai/src/askeval.test.ts` | Test aktual | 6 dari 15 kategori |
| `packages/meeting/src/globalask.ts` | Implementasi aktual | Global ask |
| `packages/shared/src/types.ts` | Kontrak data | AskResult, EvidenceSpan |
