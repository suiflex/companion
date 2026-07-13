import type { Analysis, ChatMessage, Meeting } from '@meetcc/shared';
import { formatTranscript } from './analyze';
import { AIError, type AIClient } from './client';

// "Chat with transcript" — grounded Q&A over one meeting. v1 is context
// stuffing: the whole transcript (truncated by formatTranscript) plus recent
// chat history goes in one prompt. No RAG/embeddings — a 1-2h meeting fits
// every modern provider's context window.

/** Only the last few turns are replayed — enough for follow-ups, bounded cost. */
export const MAX_HISTORY_TURNS = 8;

export const ASK_SYSTEM_PROMPT = `Kamu asisten yang menjawab pertanyaan HANYA berdasarkan transcript rapat yang diberikan.
Aturan:
- Jawab ringkas dan langsung, dalam bahasa yang sama dengan transcript.
- Dukung jawaban dengan bukti: sebutkan timestamp [jj:mm] atau nama pembicara dari transcript.
- Jika informasi tidak ada di transcript, katakan jujur "Tidak disebutkan dalam rapat." Jangan mengarang.
- Jangan menambahkan opini atau saran di luar isi rapat kecuali diminta.`;

function historyBlock(history: ChatMessage[]): string {
  const recent = history.slice(-MAX_HISTORY_TURNS);
  if (!recent.length) return '';
  const lines = recent.map(
    (m) => `${m.role === 'user' ? 'Pengguna' : 'Asisten'}: ${m.content}`,
  );
  return `\n\nPercakapan sebelumnya:\n${lines.join('\n')}`;
}

export function buildAskPrompt(
  meeting: Meeting,
  analysis: Analysis | null,
  history: ChatMessage[],
  question: string,
): string {
  const summary = analysis?.executiveSummary
    ? `\n\nRingkasan rapat:\n${analysis.executiveSummary}`
    : '';
  return (
    `Rapat: ${meeting.id}\n\nTranscript:\n${formatTranscript(meeting)}` +
    summary +
    historyBlock(history) +
    `\n\nPertanyaan: ${question}`
  );
}

/** Answer a question about one meeting, with one retry on transient failure. */
export async function askTranscript(
  client: AIClient,
  meeting: Meeting,
  analysis: Analysis | null,
  history: ChatMessage[],
  question: string,
): Promise<string> {
  const q = question.trim();
  if (!q) throw new AIError('Pertanyaan kosong', false);
  const req = { system: ASK_SYSTEM_PROMPT, user: buildAskPrompt(meeting, analysis, history, q) };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const answer = (await client.complete(req)).trim();
      if (!answer) throw new AIError('Jawaban kosong dari AI', true);
      return answer;
    } catch (e) {
      lastError = e;
      if (e instanceof AIError && !e.retryable) break;
    }
  }
  throw lastError;
}
