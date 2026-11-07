import express, { type NextFunction, type Request, type Response } from "express";
import { bus } from "./bus.js";
import { config } from "./config.js";
import { repo } from "./db.js";
import { isBusy, startJob, startOwnerRevision, startRetryOutput, startReviewOutput, startSearch } from "./pipeline.js";
import { FORMATS, TOPICS, type Format } from "./types.js";

const app = express();
app.use(express.json());

app.get("/api/state", (_req, res) => {
  res.json({
    simulasi: config.simulasi,
    provider: config.provider,
    busy: isBusy(),
    models: config.models,
    agents: bus.agents(),
    ...repo.snapshot(),
  });
});

app.get("/api/events", (_req, res) => bus.subscribe(res));

app.post("/api/searches", (req, res) => {
  const topics = (Array.isArray(req.body?.topics) ? req.body.topics : []).filter((t: unknown) =>
    (TOPICS as readonly unknown[]).includes(t),
  );
  const instruction = String(req.body?.instruction ?? "").trim().slice(0, 500);
  if (!topics.length && !instruction) {
    res.status(400).json({ error: "Pilih minimal satu topik atau tulis tugas untuk Manajer." });
    return;
  }
  res.json({ id: startSearch(topics.length ? topics : [...TOPICS], instruction) });
});

app.post("/api/candidates/:id/produce", (req, res) => {
  const formats = (Array.isArray(req.body?.formats) ? req.body.formats : FORMATS).filter((f: unknown) =>
    (FORMATS as readonly unknown[]).includes(f),
  ) as Format[];
  if (!formats.length) {
    res.status(400).json({ error: "Pilih minimal satu format konten." });
    return;
  }
  res.json({ id: startJob(Number(req.params.id), formats) });
});

app.post("/api/outputs/:id/approve", (req, res) => {
  repo.approve(Number(req.params.id));
  bus.refresh();
  res.json({ ok: true });
});

app.post("/api/outputs/:id/revise", (req, res) => {
  const notes = String(req.body?.notes ?? "").trim();
  if (!notes) {
    res.status(400).json({ error: "Tulis catatan revisinya dulu." });
    return;
  }
  startOwnerRevision(Number(req.params.id), notes.slice(0, 1000));
  res.json({ ok: true });
});

app.post("/api/outputs/:id/retry", (req, res) => {
  startRetryOutput(Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/outputs/:id/review", (req, res) => {
  startReviewOutput(Number(req.params.id));
  res.json({ ok: true });
});

app.get("/api/jobs/:id/export.md", (req, res) => {
  const data = repo.jobExport(Number(req.params.id));
  if (!data) {
    res.status(404).send("Tidak ditemukan");
    return;
  }
  const md = [
    `# ${data.job.title}`,
    "",
    ...data.outputs.flatMap((o) => [`## ${String(o.format)}`, "", String(o.content), ""]),
  ].join("\n");
  res.type("text/markdown").attachment(`konten-${req.params.id}.md`).send(md);
});

// Error dari pipeline (misalnya tim sibuk) dikirim sebagai pesan yang bisa dibaca panel.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(409).json({ error: err.message });
});

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Server redaksi jalan di http://localhost:${config.port}`);
  console.log(
    config.simulasi
      ? "Mode SIMULASI: belum ada GEMINI_API_KEY / ANTHROPIC_API_KEY di server/.env (atau SIMULASI=1)."
      : `Penyedia: ${config.provider}. Model: ${JSON.stringify(config.models)}` +
          (config.provider === "gemini" ? `. Cari berita lewat: ${config.geminiSearch === "rss" ? "Google News RSS" : "Google Search grounding"}` : ""),
  );
});
