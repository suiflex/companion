# Companion — Product & Architecture Development Plan

## Local-First Meeting Intelligence tanpa Embedding dan Vector Database

**Project:** `suiflex/companion`  
**Repository:** https://github.com/suiflex/companion  
**Dokumen:** Product & Architecture Recommendation  
**Fokus:** Ask Engine, retrieval, meeting memory, storage, SQLite/FTS5, keamanan extension, dan roadmap pengembangan

---

## 1. Executive Summary

Companion saat ini sudah mempunyai fondasi engineering yang cukup kuat sebagai AI meeting assistant berbasis browser extension:

- Google Meet dan Microsoft Teams caption capture.
- Transcript live.
- AI summary.
- Decision, action item, risk, open question, dan next step extraction.
- Transcript cleanup.
- BRD / PRD / Notulen generation.
- Multi-provider LLM.
- Local-first storage.
- Decision log dan carry-over open questions.

Namun, bottleneck produk terbesar saat ini berada pada **retrieval dan reasoning layer**, khususnya fitur **Tanya / Ask**.

Kasus seperti:

> "Gimana caranya solusi dari beberapa aplikasi yang terdampak?"

masih dapat menghasilkan jawaban:

> "Tidak disebutkan dalam rapat."

walaupun transcript sebenarnya mengandung pembahasan yang relevan.

Masalah ini **bukan karena Companion tidak memakai embedding atau vector database**. Penyebab utamanya adalah:

1. Ask masih menggunakan context stuffing.
2. Prompt terlalu strict terhadap explicit answer.
3. Tidak ada answerability classification.
4. Retrieval belum berbasis conversation window.
5. Transcript panjang dapat kehilangan bagian tengah karena truncation.
6. Evidence masih berupa citation yang dihasilkan model, bukan referensi terverifikasi.
7. Meeting session dan room identity belum dipisahkan dengan kuat.

Rekomendasi utama dokumen ini adalah mempertahankan arah:

> **No embedding, no vector database.**

Sebagai gantinya, Companion dikembangkan menggunakan:

> **SQLite + FTS5 + structured meeting memory + LLM reasoning.**

LLM digunakan untuk memahami dan menalar, bukan sebagai mekanisme penyimpanan atau semantic indexing.

---

# 2. Current Product Position

Companion sebaiknya tidak diposisikan hanya sebagai:

> AI meeting notes extension.

Arah yang lebih kuat adalah:

> **Local-first Meeting Intelligence — private meeting memory that users control.**

Perubahan paradigma produk:

```text
CURRENT

Capture
  ↓
Transcript
  ↓
Summary
  ↓
Ask
  ↓
Documents
```

menjadi:

```text
TARGET

Capture
  ↓
Understand
  ↓
Remember
  ↓
Retrieve
  ↓
Reason
  ↓
Act
```

Bagian yang paling perlu diperkuat sekarang adalah:

- **Remember**
- **Retrieve**
- **Reason**

---

# 3. Kondisi Storage Saat Ini

Companion saat ini **belum menggunakan SQLite**.

Storage utama masih menggunakan:

```text
chrome.storage.local
```

Dengan pola key seperti:

```text
transcript:<meetingId>
meta:<meetingId>
analysis:<meetingId>
chat:<meetingId>
docs:<meetingId>
clean:<meetingId>
resolved:<meetingId>
docprog:<meetingId>
settings
audit
```

Model seperti ini masih reasonable ketika jumlah meeting dan transcript kecil.

Namun ketika Companion berkembang menjadi knowledge base lintas banyak meeting, model key-value akan mulai menimbulkan masalah:

- seluruh key perlu discan untuk beberapa operasi;
- filtering dan sorting dilakukan di JavaScript;
- hubungan antar entity sulit dikelola;
- full-text search tidak natural;
- indexing menjadi manual;
- migration semakin kompleks;
- cross-meeting query semakin mahal;
- evidence relationship sulit dimodelkan.

---

# 4. Mengapa Tidak Perlu Vector Database

Target Companion sebaiknya tidak mengharuskan:

- embedding API;
- embedding model lokal;
- Pinecone;
- Qdrant;
- Weaviate;
- Chroma;
- external vector service.

Untuk meeting intelligence, sebagian besar pertanyaan memiliki sinyal kuat dari:

- keyword;
- nama orang;
- aplikasi;
- project;
- keputusan;
- action item;
- waktu;
- topik;
- urutan percakapan;
- hubungan antar meeting.

Karena itu retrieval dapat dibangun melalui:

```text
Full-text search
+
BM25
+
Phrase matching
+
Fuzzy matching
+
Entity matching
+
Speaker matching
+
Temporal proximity
+
Conversation proximity
+
Structured memory
```

LLM kemudian menerima hasil retrieval yang sudah dipersempit untuk melakukan reasoning.

---

# 5. Target Storage: SQLite + FTS5

Untuk perkembangan jangka menengah, storage yang direkomendasikan adalah:

```text
SQLite WASM
+
OPFS
+
FTS5
```

Arsitektur:

```text
Chrome Extension
      │
      ├── UI
      ├── Background / Service Worker
      ├── sqlite3.js
      ├── sqlite3.wasm
      │
      └── OPFS
           └── companion.db
```

SQLite tetap berjalan lokal pada browser profile user.

Tidak ada database server.

Tidak ada port yang dibuka.

Tidak memerlukan user meng-install SQLite secara manual.

---

# 6. Mengapa SQLite Cocok untuk Companion

SQLite memberi kemampuan yang akan semakin penting ketika data berkembang:

```sql
SELECT *
FROM meetings
ORDER BY started_at DESC
LIMIT 30;
```

```sql
SELECT *
FROM action_items
WHERE owner = 'Akbar'
  AND status = 'open';
```

```sql
SELECT *
FROM decisions
WHERE project_id = ?
ORDER BY decided_at DESC;
```

Dan melalui FTS5:

```sql
SELECT
    rowid,
    text,
    bm25(transcript_fts) AS score
FROM transcript_fts
WHERE transcript_fts MATCH
    'freeport OR shared OR aplikasi OR terdampak'
ORDER BY score
LIMIT 20;
```

Dengan demikian query tidak perlu memuat seluruh transcript ke memory.

---

# 7. SQLite di Chrome Extension Aman atau Tidak?

SQLite WASM + OPFS merupakan pendekatan yang reasonable untuk browser extension selama implementasinya benar.

## 7.1 SQLite harus dibundle

Jangan melakukan runtime load seperti:

```html
<script src="https://cdn.example.com/sqlite3.js"></script>
```

Gunakan:

```text
extension package
├── background.js
├── sqlite3.js
├── sqlite3.wasm
└── ...
```

Semua executable code menjadi bagian dari extension build.

## 7.2 Data tetap local

Database berada di storage sandbox browser untuk origin extension:

```text
chrome-extension://<extension-id>/
```

Website biasa tidak mendapatkan akses langsung ke database tersebut.

## 7.3 Local bukan berarti encrypted

SQLite + OPFS memberikan:

- local persistence;
- sandbox isolation;

namun tidak secara otomatis memberikan full-database encryption.

Jika attacker mendapatkan full OS/browser profile, data masih berpotensi diekstrak.

Ini bukan masalah khusus SQLite. `chrome.storage.local` juga berada pada security boundary browser profile.

---

# 8. Rekomendasi Security Model

## 8.1 Default OSS / Personal Mode

```text
SQLite + OPFS
+
Browser profile protection
```

Ini cukup reasonable sebagai default local-first.

## 8.2 Sensitive Secret

API key sebaiknya tetap diperlakukan lebih sensitif daripada transcript.

Pilihan ke depan:

```text
API key
  ├── Session only
  ├── Browser profile encrypted
  ├── OS keychain bridge
  └── Organization proxy
```

## 8.3 Permission Hardening

Permission broad seperti:

```text
https://*/*
```

sebaiknya dikurangi.

Arah yang lebih baik:

```text
Default
  ├── meet.google.com
  └── teams.microsoft.com

OpenAI dipilih user
  ↓
request permission api.openai.com

Custom endpoint dipilih user
  ↓
request permission domain tersebut
```

Gunakan optional host permission jika memungkinkan.

---

# 9. Problem Utama Ask Engine Saat Ini

Ask saat ini menggunakan pola:

```text
Question
+
Transcript
+
Summary
+
Recent Chat History
        ↓
       LLM
        ↓
      Answer
```

Pendekatan tersebut mempunyai beberapa kelemahan.

## 9.1 Strict prompt behavior

Current policy pada dasarnya mendorong model:

```text
Jika tidak ada jawaban eksplisit
→ "Tidak disebutkan dalam rapat."
```

Padahal meeting conversation sering menghasilkan informasi parsial atau implicit.

## 9.2 Transcript truncation

Transcript panjang saat ini dapat dipotong menjadi:

```text
first part
...
[MIDDLE REMOVED]
...
last part
```

Jika topik yang ditanyakan berada di tengah meeting, model bahkan tidak pernah melihat evidence tersebut.

## 9.3 Line bukan conversation

Jawaban sebuah pertanyaan rapat biasanya tersebar di beberapa turn:

```text
Speaker A → menjelaskan masalah
Speaker B → menanyakan solusi
Speaker C → memberi opsi
Speaker A → memberikan keputusan
```

Retrieval tidak boleh berakhir pada satu caption line saja.

---

# 10. Ask Engine v2 — Tanpa Embedding

Target flow:

```text
User Question
      │
      ▼
Intent Detection
      │
      ▼
Query Planner
      │
      ▼
Lexical + Structural Retrieval
      │
      ├── FTS5 / BM25
      ├── exact phrase
      ├── fuzzy term
      ├── entity
      ├── speaker
      ├── topic
      └── time constraint
      │
      ▼
Conversation Window Expansion
      │
      ▼
Relevant Evidence
      │
      ▼
LLM Reasoning
      │
      ▼
Grounding Verification
      │
      ▼
Structured Answer
```

---

# 11. Intent Detection

Ask tidak boleh memiliki satu behavior untuk semua pertanyaan.

Minimal empat intent:

```text
RECALL
"Deadline kapan?"

EXPLAIN
"Kenapa opsi itu dipilih?"

ANALYZE
"Apa masalah utama dari pembahasan ini?"

ADVISE
"Menurutmu solusi terbaik seharusnya bagaimana?"
```

Untuk `ADVISE`, UI harus membedakan dengan jelas:

```text
Berdasarkan rapat
vs
Analisis / saran Companion
```

Agar grounding dan recommendation tidak tercampur.

---

# 12. Answerability Classification

Ini adalah salah satu perubahan paling penting.

Jangan hanya mempunyai:

```text
FOUND
NOT FOUND
```

Gunakan:

```text
EXPLICIT
PARTIAL
INFERRED
NOT_FOUND
```

## 12.1 Explicit

Transcript:

> "Kita putuskan semua aplikasi pakai shared service."

Jawaban:

> Tim memutuskan menggunakan shared service.

## 12.2 Partial

Transcript:

> "Ada beberapa aplikasi terdampak."
>
> "Solusinya akan shared atau dibuat terpisah?"

Jawaban:

> Belum ada solusi final yang diputuskan. Pembahasan mengarah ke dua opsi: shared solution atau implementasi terpisah per aplikasi.

Ini adalah behavior yang seharusnya muncul pada kasus screenshot.

## 12.3 Inferred

Transcript:

```text
A: Service existing masih bisa dipakai.
B: Jadi tidak perlu service baru?
A: Iya, pakai existing saja.
```

Jawaban:

> Dari rangkaian pembahasan, tim tampaknya memilih menggunakan service existing.

UI:

```text
Status: inferred from discussion
```

## 12.4 Not Found

Baru digunakan ketika tidak ada evidence yang relevan setelah retrieval dilakukan.

---

# 13. Query Planner tanpa Embedding

LLM dapat dipakai sebagai query planner tanpa embedding.

Contoh input:

> "gimana solusi beberapa aplikasi yang terdampak?"

Planner menghasilkan:

```json
{
  "intent": "analyze",
  "keywords": [
    "solusi",
    "aplikasi",
    "terdampak"
  ],
  "relatedTerms": [
    "shared",
    "terpisah",
    "mekanisme",
    "penanganan"
  ]
}
```

Output ini kemudian diterjemahkan menjadi query FTS5 / BM25.

LLM tidak menyimpan vector.

LLM hanya membantu memahami query.

---

# 14. Multi-Pass Retrieval

Retrieval jangan langsung menyerah ketika exact search lemah.

Gunakan beberapa pass:

```text
PASS 1
Exact / BM25

   ↓ weak

PASS 2
Expanded terms

   ↓ weak

PASS 3
Entity + topic + temporal broadening

   ↓ weak

NOT_FOUND
```

Dengan demikian query natural user tetap dapat menemukan diskusi meskipun wording transcript berbeda.

---

# 15. Conversation Window Retrieval

Setelah hit ditemukan, jangan hanya mengambil satu row.

Contoh:

```text
14:47:12 ← lexical match
```

Expand menjadi:

```text
14:45:30
    │
    ▼
14:47:12 ← hit
    │
    ▼
14:49:30
```

Atau berbasis turn:

```text
- N previous turns
+ hit
+ N next turns
```

Window dapat berhenti ketika:

- topic berubah;
- gap waktu terlalu besar;
- speaker context selesai;
- paragraph/segment boundary tercapai.

---

# 16. Entry ID dan Evidence yang Terverifikasi

Current transcript entry perlu dikembangkan dari:

```ts
interface Entry {
  speaker: string
  avatar?: string
  text: string
  time: string
}
```

menjadi:

```ts
interface Entry {
  id: string
  sessionId: string
  speaker: string
  avatar?: string
  text: string
  time: string
  endTime?: string
}
```

Transcript yang diberikan ke model:

```text
[E1032][14:47:01] Akbar: ...
[E1033][14:47:20] Widi: ...
[E1034][14:48:02] Akbar: ...
```

Model mengembalikan:

```json
{
  "answer": "...",
  "evidence": ["E1032", "E1033", "E1034"]
}
```

Backend kemudian memverifikasi bahwa ID tersebut benar-benar ada.

Dengan demikian timestamp tidak dibuat secara bebas oleh model.

---

# 17. Structured Ask Result

Ask sebaiknya tidak lagi hanya mengembalikan string.

Target:

```ts
interface AskResult {
  answer: string

  answerability:
    | 'explicit'
    | 'partial'
    | 'inferred'
    | 'not_found'

  intent:
    | 'recall'
    | 'explain'
    | 'analyze'
    | 'advise'

  confidence: number

  evidence: {
    entryIds: string[]
    startTime: string
    endTime: string
  }[]

  missing: string[]
  followUps: string[]
}
```

UI dapat menampilkan:

```text
Belum ada solusi final yang diputuskan.

Pembahasan mengarah pada dua opsi:
1. shared solution
2. implementasi terpisah per aplikasi

Belum diputuskan:
- arsitektur final

Evidence
- Akbar · 14:47
- Widi · 14:47

Confidence: Medium

[Open transcript]
```

---

# 18. Structured Meeting Memory

Knowledge tidak perlu disimpan sebagai vector.

Extract meeting menjadi entity terstruktur:

```text
Meeting
├── Participants
├── Topics
├── Decisions
├── Action Items
├── Open Questions
├── Risks
├── Applications / Systems
└── Evidence
```

Kemudian relationship:

```text
Decision
  ├── DECIDED_IN → Meeting
  ├── REFERENCES → Transcript Entry
  └── SUPERSEDES → Previous Decision

Action Item
  ├── ASSIGNED_TO → Person
  ├── CREATED_IN → Meeting
  └── REFERENCES → Transcript Entry

Question
  ├── OPENED_IN → Meeting
  └── RESOLVED_IN → Meeting
```

Tidak membutuhkan graph database pada tahap awal.

SQLite relational tables sudah cukup.

---

# 19. Proposed SQLite Schema

Contoh high-level schema:

```sql
CREATE TABLE meeting_rooms (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  external_room_id TEXT NOT NULL
);

CREATE TABLE meeting_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  title TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  FOREIGN KEY(room_id) REFERENCES meeting_rooms(id)
);

CREATE TABLE transcript_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  FOREIGN KEY(session_id) REFERENCES meeting_sessions(id)
);

CREATE TABLE decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  topic TEXT,
  decision TEXT NOT NULL,
  reason TEXT,
  confidence REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  task TEXT NOT NULL,
  owner TEXT,
  due_at TEXT,
  status TEXT DEFAULT 'open'
);

CREATE TABLE open_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT DEFAULT 'open'
);

CREATE TABLE evidence_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  transcript_entry_id INTEGER NOT NULL
);
```

FTS:

```sql
CREATE VIRTUAL TABLE transcript_fts USING fts5(
  text,
  speaker,
  content='transcript_entries',
  content_rowid='id'
);
```

---

# 20. Critical Data Model Fix: Room ID vs Session ID

Recurring meeting link tidak boleh dianggap sebagai satu meeting selamanya.

Contoh:

```text
Google Meet room
xdr-fdbe-zqz
```

dapat digunakan pada:

```text
Monday meeting
Wednesday meeting
Friday meeting
```

Jadi:

```text
roomId != sessionId
```

Target:

```text
Room
xdr-fdbe-zqz
   │
   ├── Session A
   │    └── Monday
   │
   ├── Session B
   │    └── Wednesday
   │
   └── Session C
        └── Friday
```

Ini penting sebelum cross-meeting memory dibuat.

Jika tidak, transcript, keputusan, dan action item dari beberapa session dapat bercampur.

---

# 21. Meeting Metadata

Jangan hanya menggunakan meeting code sebagai title UI.

Target model:

```ts
interface MeetingSession {
  id: string
  roomId: string
  platform: 'google-meet' | 'teams' | 'zoom'

  title?: string
  agenda?: string

  startedAt: string
  endedAt?: string
  duration?: number

  participants: Participant[]

  calendarEventId?: string
}
```

UI:

```text
Incident Resolution — Freeport
24 Aug 2026 · 14:00–15:10
8 participants · Google Meet
```

lebih berguna daripada:

```text
xdr-fdbe-zqz
```

---

# 22. Global Search

Tambahkan command-style search:

```text
⌘ K
```

Contoh:

```text
freeport shared service
```

Hasil:

```text
Incident Meeting — Aug 24
14:47 Akbar
"...Freeport dan ticket..."

Architecture Meeting — Aug 21
31:04 Widi
"...Freeport API..."
```

User kemudian dapat memilih:

```text
Ask about these results
```

---

# 23. Global Ask Tanpa Vector

Global Ask dapat memakai structured query.

Pertanyaan:

> "Apa keputusan terkait Freeport 3 bulan terakhir?"

Planner:

```json
{
  "type": "decision_search",
  "entity": "Freeport",
  "range": "3_months"
}
```

Kemudian:

```text
Decision Table
   ↓
filter entity/topic/date
   ↓
relevant meetings
   ↓
evidence windows
   ↓
LLM synthesis
```

Tidak memerlukan embedding.

---

# 24. Meeting Continuity

Salah satu diferensiasi terbesar Companion dapat berasal dari continuity lintas meeting.

Contoh:

```text
PROJECT: Freeport Integration

Meeting #1
  Decision A
  Question X

      ↓

Meeting #2
  Question X resolved
  Decision A revised
  Action Y created

      ↓

Meeting #3
  Action Y overdue
  Blocker Z detected
```

Pertanyaan:

> "Kenapa keputusan arsitektur berubah?"

Companion dapat menyusun chronology berdasarkan structured memory dan evidence.

---

# 25. Action Item Lifecycle

Action item jangan berhenti sebagai tabel hasil AI.

Target:

```text
Implement fix Ticket 2

Owner: Akbar
Due: 28 Aug
Status: Open
Source: 14:52

[Mark Done]
[Add to Calendar]
[Open Transcript]
```

Kemudian meeting berikutnya:

```text
3 action items dari meeting sebelumnya masih terbuka.
```

Ini membuat Companion benar-benar membantu setelah meeting selesai.

---

# 26. Transcript Cleanup dan Provenance

Current concept raw transcript + cleaned transcript harus dipertahankan.

Namun untuk perubahan sensitif seperti angka dan istilah, UI ideal:

```text
RAW
"target dua ribu tiga"

CLEANED
"target 2023"

Confidence: 71%

[Accept]
[Keep Original]
```

Karena cleaned transcript menjadi source untuk downstream AI, kesalahan cleanup dapat memengaruhi:

```text
cleanup salah
    ↓
summary salah
    ↓
decision salah
    ↓
Ask salah
    ↓
PRD salah
```

Setiap correction sebaiknya mempunyai provenance.

---

# 27. Search Index Strategy

Tidak hanya transcript yang dapat di-index.

Gunakan beberapa logical index:

```text
Transcript Index
Clean Transcript Index
Analysis Index
Decision Index
Action Item Index
Open Question Index
Document Index
```

Search engine dapat melakukan weighted retrieval.

Contoh:

```text
query:
"solusi aplikasi terdampak"
```

Dapat match pada open question:

```text
"Apakah solusi beberapa aplikasi akan dishare atau dibuat terpisah?"
```

Open question tersebut kemudian menjadi pointer untuk mengambil source conversation.

---

# 28. LLM Responsibilities

LLM sebaiknya digunakan untuk:

```text
Understand
Reason
Summarize
Classify
Synthesize
Extract
Recommend
```

Bukan sebagai:

```text
Database
Vector index
Storage layer
Source of citation truth
```

Boundary yang direkomendasikan:

```text
                 NO EMBEDDING

Capture
   ↓
Transcript
   ↓
SQLite + FTS5
   ↓
Structured Memory
   ↓
Retriever
   ↓
Relevant Evidence
   ↓
LLM Reasoner
   ↓
Evidence Verifier
   ↓
Answer
```

---

# 29. MV3 Lifecycle Consideration

Chrome MV3 service worker dapat di-suspend kapan saja.

Jangan bergantung pada:

```text
SQLite connection hidup selamanya
```

Database adapter harus resilient:

```text
open
query
transaction
close / reopen
```

Untuk operasi berat, dapat dipertimbangkan dedicated extension document / offscreen context jika memang dibutuhkan.

Persistence harus tetap berada pada OPFS.

---

# 30. Migration Strategy dari chrome.storage.local

Jangan langsung mengganti semuanya sekaligus.

## Phase 1 — Storage abstraction

Buat interface:

```ts
interface CompanionStore {
  meetings: MeetingRepository
  transcripts: TranscriptRepository
  analysis: AnalysisRepository
  chat: ChatRepository
  documents: DocumentRepository
  settings: SettingsRepository
}
```

Current implementation:

```text
ChromeStorageStore
```

Target implementation:

```text
SQLiteStore
```

## Phase 2 — Dual read / migration

```text
Startup
  ↓
SQLite exists?
  ├── yes → use SQLite
  └── no
       ↓
    read chrome.storage.local
       ↓
    migrate
       ↓
    verify counts/checksum
       ↓
    mark migration complete
```

## Phase 3 — Keep compatibility window

Untuk beberapa versi:

- backup migration status;
- preserve rollback possibility;
- do not delete legacy data immediately.

---

# 31. Evaluation Suite — Wajib

Kasus screenshot harus dijadikan regression test.

Contoh fixture:

```text
meeting-shared-solution.json
```

Question:

```text
gimana caranya solusi dari beberapa aplikasi yang terdampak?
```

Expected:

```json
{
  "answerability": "partial",
  "mustMention": [
    "belum ada keputusan final",
    "shared",
    "terpisah"
  ]
}
```

Forbidden:

```text
Tidak disebutkan dalam rapat.
```

Kategori evaluation yang perlu ada:

1. Explicit answer.
2. Partial answer.
3. Inferred answer.
4. Truly missing answer.
5. Cross-turn answer.
6. Long transcript.
7. Middle-of-transcript retrieval.
8. Speaker reference.
9. Pronoun/coreference.
10. Follow-up question.
11. Contradictory statements.
12. Changed decision.
13. Reused meeting room.
14. Multiple concurrent meetings.
15. Cleaned vs raw transcript.

---

# 32. Roadmap Prioritas

## P0 — Correctness & Ask Intelligence

P0 harus menyelesaikan masalah produk yang terlihat sekarang.

```text
P0.1  roomId vs sessionId
P0.2  stable transcript entry IDs
P0.3  conversation segmentation
P0.4  structured AskResult
P0.5  answerability classification
P0.6  query planner
P0.7  multi-pass lexical retrieval
P0.8  conversation-window expansion
P0.9  verified evidence references
P0.10 remove fixed head-tail Ask truncation
P0.11 regression/evaluation suite
```

P0 dapat dilakukan **tanpa menunggu SQLite migration**.

---

## P1 — Local Knowledge Foundation

```text
P1.1  storage abstraction
P1.2  SQLite WASM + OPFS
P1.3  migration from chrome.storage.local
P1.4  FTS5 transcript search
P1.5  meeting metadata
P1.6  global search
P1.7  structured meeting memory
P1.8  global Ask
P1.9  meeting continuity
P1.10 action lifecycle
```

---

## P2 — Product Expansion

```text
P2.1 Custom meeting templates
P2.2 Live highlights
P2.3 Project / folder grouping
P2.4 MCP server
P2.5 Calendar integration
P2.6 Optional cloud sync
P2.7 Team workspace
P2.8 Sharing and permissions
P2.9 Jira / Linear / Notion integration
P2.10 Zoom / import audio-video
```

---

# 33. MCP Direction

Ketika meeting sudah menjadi structured local knowledge base, Companion sangat cocok diekspos melalui MCP.

Potential tools:

```text
list_meetings()
search_meetings()
get_meeting()
get_transcript()
ask_meeting()
ask_meetings()
get_decisions()
get_action_items()
get_open_questions()
```

Contoh penggunaan dari coding agent:

> "Cari meeting terakhir yang membahas payment service."

> "Buat PRD berdasarkan tiga meeting terakhir Project Freeport."

Ini tetap dapat bekerja tanpa embedding selama retrieval internal menggunakan FTS5 + structured query.

---

# 34. Target Architecture

```text
                   ┌──────────────────────┐
                   │ Meet / Teams / Future│
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │   Capture Adapter    │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ Canonical Transcript │
                   │ raw + corrected      │
                   └──────────┬───────────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
             ┌────────────┐       ┌──────────────┐
             │ SQLite     │       │ AI Analysis  │
             │ + FTS5     │       │ Extraction   │
             └─────┬──────┘       └──────┬───────┘
                   │                     │
                   └──────────┬──────────┘
                              ▼
                   ┌──────────────────────┐
                   │ Structured Memory    │
                   │ decisions/actions/...│
                   └──────────┬───────────┘
                              │
                ┌─────────────┼──────────────┐
                ▼             ▼              ▼
             Search         Ask          Global Ask
                │             │              │
                └─────────────┼──────────────┘
                              ▼
                   ┌──────────────────────┐
                   │ Relevant Evidence    │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ LLM Reasoning        │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ Evidence Verification│
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ Structured Answer    │
                   └──────────────────────┘
```

---

# 35. Product Principles

Companion sebaiknya menjaga prinsip berikut.

## 35.1 Local-first

Meeting user harus tetap dapat diproses tanpa backend wajib.

## 35.2 Model agnostic

User dapat menggunakan cloud LLM maupun local LLM.

## 35.3 No mandatory embedding

Semantic embedding boleh menjadi optional adapter di masa depan, bukan core requirement.

## 35.4 Evidence-first

Setiap keputusan penting harus dapat ditelusuri ke transcript source.

## 35.5 Structured memory over opaque memory

Keputusan, action, question, person, project dan evidence lebih baik disimpan sebagai entity yang dapat di-query.

## 35.6 Graceful uncertainty

AI tidak hanya menjawab "ada" atau "tidak ada".

AI harus bisa mengatakan:

- explicit;
- partial;
- inferred;
- not found.

## 35.7 Privacy by architecture

Data tetap lokal secara default; sync dan collaboration bersifat optional.

---

# 36. Final Recommendation

Companion tidak membutuhkan vector database untuk menyelesaikan masalah Ask yang sekarang.

Masalah yang harus diselesaikan terlebih dahulu adalah:

```text
retrieval
+
conversation context
+
answerability
+
verified evidence
+
session correctness
```

Arsitektur paling cocok untuk arah produk ini adalah:

```text
SQLite WASM + OPFS
        +
FTS5 / BM25
        +
Structured Meeting Memory
        +
LLM Query Planning & Reasoning
        +
Evidence Verification
```

Bukan:

```text
Embedding
+
Vector DB
+
RAG infrastructure berat
```

Dan perubahan paling penting untuk pengalaman user adalah mengubah Companion dari:

```text
"Tidak disebutkan dalam rapat."
```

menjadi sistem yang mampu mengatakan:

```text
"Belum ada keputusan final. Dari pembahasan, ada dua opsi yang sedang dipertimbangkan: shared solution atau implementasi terpisah. Berikut evidence-nya."
```

Itulah fondasi agar Companion berkembang dari meeting-note extension menjadi **local-first meeting intelligence platform**.

