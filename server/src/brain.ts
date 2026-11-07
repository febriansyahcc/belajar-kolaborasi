import { callClaude, callJson, models } from "./claude.js";
import { config } from "./config.js";
import { prompts, schemas } from "./prompts.js";
import type { Candidate, Format } from "./types.js";

export type NewCandidate = Omit<Candidate, "id" | "search_id" | "selected">;
export type Briefs = Record<Format, string>;
export interface Review {
  lolos: boolean;
  catatan: string;
}

/** Semua pekerjaan "berpikir" karyawan AI. Ada dua versi: Claude sungguhan dan simulasi. */
export interface Brain {
  search(topics: string[], instruction: string): Promise<NewCandidate[]>;
  brief(c: Candidate, formats: Format[], jobId: number): Promise<Briefs>;
  write(
    format: Format,
    c: Candidate,
    brief: string,
    jobId: number,
    revisi?: { draft: string; catatan: string },
  ): Promise<string>;
  review(format: Format, c: Candidate, content: string, jobId: number): Promise<Review>;
}

const today = () =>
  new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

const claudeBrain: Brain = {
  async search(topics, instruction) {
    const { text: laporan } = await callClaude({
      agent: "manajer",
      model: models.manajer,
      system: prompts.searchSystem,
      prompt: prompts.searchPrompt(topics, instruction, today()),
      webSearch: config.maxWebSearch,
      effort: "medium",
      maxTokens: 16000,
    });
    const data = await callJson<{ candidates: NewCandidate[] }>({
      agent: "manajer",
      model: models.ringan,
      system: prompts.extractSystem,
      prompt: laporan,
      schema: schemas.candidates,
      effort: "low",
    });
    return data.candidates.slice(0, 5);
  },

  brief(c, formats, jobId) {
    return callJson<Briefs>({
      agent: "manajer",
      model: models.manajer,
      system: prompts.briefSystem,
      prompt: `${prompts.bahan(c)}\n\nFormat yang dibutuhkan: ${formats.join(", ")}. Isi format lain dengan "-".`,
      schema: schemas.briefs,
      effort: "low",
      jobId,
    });
  },

  async write(format, c, brief, jobId, revisi) {
    const parts = [prompts.bahan(c), `Brief dari Manajer:\n${brief}`];
    if (revisi) parts.push(`Draf sebelumnya:\n${revisi.draft}`, `Perbaiki draf sesuai catatan ini:\n${revisi.catatan}`);
    const { text } = await callClaude({
      agent: format,
      model: models.penulis,
      system: prompts.writerSystem(format),
      prompt: parts.join("\n\n"),
      effort: "low",
      jobId,
    });
    return text;
  },

  review(format, c, content, jobId) {
    return callJson<Review>({
      agent: "editor",
      model: models.editor,
      system: prompts.editorSystem,
      prompt: `Bahan berita:\n${prompts.bahan(c)}\n\nFormat: ${format}\n\nKonten yang dicek:\n${content}`,
      schema: schemas.review,
      effort: "low",
      jobId,
    });
  },
};

// ---------- Mode simulasi: tanpa API, untuk mencoba alur dan tampilan ----------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms + Math.random() * 1500));

const simBrain: Brain = {
  async search(topics) {
    await wait(4000);
    return topics.slice(0, 3).map((t, i) => ({
      title: `[SIMULASI] Berita hangat ${i + 1} seputar ${t}`,
      summary: "Ini contoh ringkasan dari mode simulasi. Isi API key di server/.env untuk berita sungguhan.",
      why_hot: "Contoh alasan: ramai dibicarakan di media sosial.",
      published_at: today(),
      sources: [{ title: "Contoh sumber", url: "https://example.com" }],
    }));
  },
  async brief() {
    await wait(2500);
    const b = "[SIMULASI] Sudut pandang: dampaknya buat pembaca muda. Poin kunci: fakta utama dan reaksi publik.";
    return { artikel: b, caption: b, thread: b, video: b };
  },
  async write(format, c, _brief, _jobId, revisi) {
    await wait(5000);
    return `[SIMULASI${revisi ? ", revisi" : ""}] Contoh ${format} tentang "${c.title}".\n\nSumber: ${c.sources[0]?.url ?? "-"}`;
  },
  async review(_format, _c, content) {
    await wait(2000);
    const lolos = content.includes("revisi") || Math.random() > 0.3;
    return { lolos, catatan: lolos ? "Aman, fakta sesuai bahan." : "Tambahkan konteks waktu kejadian." };
  },
};

export const brain: Brain = config.simulasi ? simBrain : claudeBrain;
