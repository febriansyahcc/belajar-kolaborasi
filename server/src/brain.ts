import { bus } from "./bus.js";
import { askClaude } from "./claude.js";
import { config } from "./config.js";
import { askGemini } from "./gemini.js";
import type { Ask, AskOptions } from "./llm.js";
import { fetchNews } from "./news.js";
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

const askJson = async <T>(ask: Ask, opts: AskOptions & { schema: Record<string, unknown> }): Promise<T> =>
  JSON.parse((await ask(opts)).text) as T;

const tanggal = (rfc822: string) => {
  const d = new Date(rfc822);
  return Number.isNaN(d.getTime())
    ? rfc822
    : d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
};

/**
 * Manajer memilih dari judul Google News. Model hanya menyebut nomor judul,
 * URL sumber diambil dari RSS, jadi link tidak mungkin dikarang.
 */
export async function searchFromRss(ask: Ask, topics: string[], instruction: string): Promise<NewCandidate[]> {
  const items = await fetchNews(topics, instruction);
  bus.log("manajer", `Ambil ${items.length} judul terbaru dari Google News.`);
  const list = items.map((it, i) => `[${i + 1}] ${it.title} (${it.source}, ${tanggal(it.published)})`).join("\n");
  const data = await askJson<{ candidates: { title: string; summary: string; why_hot: string; source_ids: number[] }[] }>(
    ask,
    {
      agent: "manajer",
      role: "manajer",
      system: prompts.pickSystem,
      prompt: prompts.pickPrompt(list, topics, instruction, today()),
      schema: schemas.picks,
      effort: "low",
    },
  );
  return data.candidates.slice(0, 5).flatMap((c) => {
    const used = [...new Set(c.source_ids)].map((n) => items[n - 1]).filter((it): it is (typeof items)[number] => !!it);
    if (!used.length) return [];
    return [
      {
        title: c.title,
        summary: c.summary,
        why_hot: c.why_hot,
        published_at: tanggal(used[0].published),
        sources: used.map((it) => ({ title: `${it.source}: ${it.title}`, url: it.url })),
      },
    ];
  });
}

/** Otak yang sama untuk semua penyedia; yang berbeda hanya fungsi `ask`. */
function llmBrain(ask: Ask, useRss: boolean): Brain {
  return {
    async search(topics, instruction) {
      if (useRss) return searchFromRss(ask, topics, instruction);
      const riset = await ask({
        agent: "manajer",
        role: "manajer",
        system: prompts.searchSystem,
        prompt: prompts.searchPrompt(topics, instruction, today()),
        search: true,
        effort: "medium",
        maxTokens: 16000,
      });
      // Gemini melaporkan sumber terpisah dari teks; sertakan supaya URL tidak dikarang.
      const daftar = riset.sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`).join("\n");
      const data = await askJson<{ candidates: NewCandidate[] }>(ask, {
        agent: "manajer",
        role: "ringan",
        system: prompts.extractSystem,
        prompt: daftar ? `${riset.text}\n\nDaftar sumber yang dipakai:\n${daftar}` : riset.text,
        schema: schemas.candidates,
        effort: "low",
      });
      return data.candidates.slice(0, 5);
    },

    brief(c, formats, jobId) {
      return askJson<Briefs>(ask, {
        agent: "manajer",
        role: "manajer",
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
      const { text } = await ask({
        agent: format,
        role: "penulis",
        system: prompts.writerSystem(format),
        prompt: parts.join("\n\n"),
        effort: "low",
        jobId,
      });
      return text;
    },

    review(format, c, content, jobId) {
      return askJson<Review>(ask, {
        agent: "editor",
        role: "editor",
        system: prompts.editorSystem,
        prompt: `Bahan berita:\n${prompts.bahan(c)}\n\nFormat: ${format}\n\nKonten yang dicek:\n${content}`,
        schema: schemas.review,
        effort: "low",
        jobId,
      });
    },
  };
}

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

export const brain: Brain =
    config.provider === "gemini"
    ? llmBrain(askGemini, config.geminiSearch === "rss")
    : config.provider === "claude"
      ? llmBrain(askClaude, false)
      : simBrain;
