import { brain } from "./brain.js";
import { bus } from "./bus.js";
import { repo } from "./db.js";
import type { Candidate, Format } from "./types.js";

/** Tim hanya mengerjakan satu pekerjaan dalam satu waktu. */
let busy = false;
export const isBusy = () => busy;

/** Pesan error yang enak dibaca; error API Gemini datang sebagai JSON. */
function errMsg(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(msg) as { error?: { code?: number; message?: string } };
    if (parsed.error?.message) return `${parsed.error.code ?? ""} ${parsed.error.message}`.trim();
  } catch {
    // bukan JSON, pakai apa adanya
  }
  return msg;
}

function runExclusive(task: () => Promise<void>) {
  if (busy) throw new Error("Tim sedang sibuk. Tunggu pekerjaan sekarang selesai dulu.");
  busy = true;
  // Pekerjaan baru dimulai: tanda "Gagal" dari pekerjaan sebelumnya tidak relevan lagi.
  for (const a of bus.agents()) if (a.status === "gagal") bus.setAgent(a.id, "santai");
  void task().finally(() => {
    busy = false;
    bus.refresh();
  });
}

export function startSearch(topics: string[], instruction: string) {
  if (busy) throw new Error("Tim sedang sibuk. Tunggu pekerjaan sekarang selesai dulu.");
  const searchId = repo.createSearch(topics, instruction);
  runExclusive(async () => {
    bus.setAgent("manajer", "mencari", "Cari berita hangat");
    bus.log("manajer", `Mulai cari berita: ${topics.join(", ")}${instruction ? ` — "${instruction}"` : ""}`);
    try {
      const found = await brain.search(topics, instruction);
      for (const c of found) repo.addCandidate(searchId, c);
      repo.finishSearch(searchId, "done");
      bus.log("manajer", `Ketemu ${found.length} kandidat. Silakan pilih satu.`);
      bus.setAgent("manajer", "menunggu", "Pilih berita di panel");
    } catch (e) {
      repo.finishSearch(searchId, "failed", errMsg(e));
      bus.log("manajer", `Gagal mencari: ${errMsg(e)}`, { type: "error" });
      bus.setAgent("manajer", "gagal", errMsg(e));
    }
  });
  return searchId;
}

// Editor bekerja satu per satu: semua permintaan cek masuk antrean.
// Selama antrean belum kosong Editor tetap di mejanya.
let editorQueue: Promise<unknown> = Promise.resolve();
let editorPending = 0;
function queueReview<T>(task: () => Promise<T>): Promise<T> {
  editorPending++;
  const run = () =>
    task().finally(() => {
      editorPending--;
      if (editorPending === 0) bus.setAgent("editor", "santai");
    });
  const next = editorQueue.then(run, run);
  editorQueue = next.catch(() => undefined);
  return next;
}

async function writeAndReview(
  outputId: number,
  format: Format,
  c: Candidate,
  brief: string,
  jobId: number,
  revisi?: { draft: string; catatan: string },
  revisionNo = 0,
): Promise<void> {
  bus.setAgent(format, "menulis", revisi ? "Merevisi draf" : "Menulis draf");
  let content: string;
  try {
    content = await brain.write(format, c, brief, jobId, revisi);
  } catch (e) {
    // Belum ada draf sama sekali: ini benar-benar gagal.
    if (!revisi) throw e;
    // Revisi gagal: draf sebelumnya tetap tersimpan dan bisa dipakai.
    bus.log(format, `Gagal merevisi: ${errMsg(e)} Draf sebelumnya tetap dipakai.`, { jobId, type: "error" });
    bus.setAgent(format, "santai");
    bus.refresh();
    return;
  }
  repo.setOutputContent(outputId, content, revisionNo);
  bus.setAgent(format, "menunggu", "Menunggu cek Editor");
  bus.log(format, revisi ? "Revisi selesai, kirim ke Editor." : "Draf selesai, kirim ke Editor.", { jobId });
  bus.refresh();

  if (!(await review(outputId, format, c, content, jobId))) {
    // Editor gagal mengecek, tapi tulisan sudah jadi: penulis tidak dianggap gagal.
    bus.setAgent(format, "santai");
    return;
  }
  const out = repo.output(outputId);

  // Revisi dari Editor maksimal satu kali, setelah itu diserahkan ke pemilik apa adanya.
  if (out?.review_status === "revisi" && revisionNo === 0) {
    return writeAndReview(outputId, format, c, brief, jobId, { draft: content, catatan: out.review_notes }, 1);
  }
  bus.setAgent(format, "santai");
}

/** Editor mengecek satu konten. Mengembalikan false bila pengecekan gagal (konten tetap tersimpan). */
async function review(outputId: number, format: Format, c: Candidate, content: string, jobId: number) {
  try {
    const r = await queueReview(async () => {
      bus.setAgent("editor", "mengecek", `Cek ${format}`);
      return brain.review(format, c, content, jobId);
    });
    repo.setReview(outputId, r.lolos ? "lolos" : "revisi", r.catatan);
    bus.log("editor", `${format}: ${r.lolos ? "lolos" : "perlu revisi"} — ${r.catatan}`, { jobId });
    return true;
  } catch (e) {
    repo.setReviewFailed(outputId, errMsg(e));
    bus.log("editor", `Gagal mengecek ${format}: ${errMsg(e)} Konten tetap tersimpan, bisa dicek ulang.`, {
      jobId,
      type: "error",
    });
    return false;
  } finally {
    bus.refresh();
  }
}

export function startJob(candidateId: number, formats: Format[]) {
  const c = repo.candidate(candidateId);
  if (!c) throw new Error("Kandidat berita tidak ditemukan.");
  if (busy) throw new Error("Tim sedang sibuk. Tunggu pekerjaan sekarang selesai dulu.");
  const jobId = repo.createJob(candidateId, formats);

  runExclusive(async () => {
    try {
      bus.setAgent("manajer", "menulis", "Menyusun brief");
      bus.log("manajer", `Berita dipilih: "${c.title}". Menyusun brief untuk ${formats.join(", ")}.`, { jobId });
      const briefs = await brain.brief(c, formats, jobId);
      bus.setAgent("manajer", "santai");

      const outputIds = formats.map((f) => repo.createOutput(jobId, f, f, briefs[f]));
      bus.refresh();
      const results = await Promise.allSettled(
        formats.map((f, i) => {
          return writeAndReview(outputIds[i], f, c, briefs[f], jobId).catch((e) => {
            bus.setAgent(f, "gagal", errMsg(e));
            bus.log(f, `Gagal: ${errMsg(e)}`, { jobId, type: "error" });
            throw e;
          });
        }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      repo.finishJob(jobId, failed ? "failed" : "done", failed ? `${failed} format gagal` : undefined);
      bus.log("sistem", failed ? `Selesai dengan ${failed} format gagal.` : "Semua konten siap dicek pemilik.", {
        jobId,
      });
    } catch (e) {
      repo.finishJob(jobId, "failed", errMsg(e));
      bus.setAgent("manajer", "gagal", errMsg(e));
      bus.log("manajer", `Gagal: ${errMsg(e)}`, { jobId, type: "error" });
    }
  });
  return jobId;
}

/** Pemilik minta revisi dengan catatannya sendiri. */
export function startOwnerRevision(outputId: number, catatan: string) {
  const out = repo.output(outputId);
  if (!out) throw new Error("Hasil tidak ditemukan.");
  const candidateId = repo.jobCandidateId(out.job_id);
  const c = candidateId !== undefined ? repo.candidate(candidateId) : undefined;
  if (!c) throw new Error("Berita untuk hasil ini tidak ditemukan.");

  runExclusive(async () => {
    bus.log("sistem", `Pemilik minta revisi ${out.format}: ${catatan}`, { jobId: out.job_id });
    try {
      // revisionNo 1 supaya tidak ada putaran revisi tambahan dari Editor.
      await writeAndReview(outputId, out.format, c, out.brief, out.job_id, { draft: out.content, catatan }, out.revision + 1);
    } catch (e) {
      bus.setAgent(out.format, "gagal", errMsg(e));
      bus.log(out.format, `Gagal revisi: ${errMsg(e)}`, { jobId: out.job_id, type: "error" });
    }
  });
}

/** Tulis ulang satu format yang gagal, dari awal. */
export function startRetryOutput(outputId: number) {
  const out = repo.output(outputId);
  if (!out) throw new Error("Hasil tidak ditemukan.");
  const candidateId = repo.jobCandidateId(out.job_id);
  const c = candidateId !== undefined ? repo.candidate(candidateId) : undefined;
  if (!c) throw new Error("Berita untuk hasil ini tidak ditemukan.");

  runExclusive(async () => {
    bus.log("sistem", `Coba lagi menulis ${out.format}.`, { jobId: out.job_id });
    try {
      await writeAndReview(outputId, out.format, c, out.brief, out.job_id);
      repo.completeJobIfDone(out.job_id);
    } catch (e) {
      bus.setAgent(out.format, "gagal", errMsg(e));
      bus.log(out.format, `Gagal: ${errMsg(e)}`, { jobId: out.job_id, type: "error" });
    }
  });
}

/** Minta Editor mengecek ulang konten yang tadi gagal dicek. */
export function startReviewOutput(outputId: number) {
  const out = repo.output(outputId);
  if (!out?.content) throw new Error("Belum ada konten untuk dicek.");
  const candidateId = repo.jobCandidateId(out.job_id);
  const c = candidateId !== undefined ? repo.candidate(candidateId) : undefined;
  if (!c) throw new Error("Berita untuk hasil ini tidak ditemukan.");
  runExclusive(async () => {
    await review(outputId, out.format, c, out.content, out.job_id);
  });
}
