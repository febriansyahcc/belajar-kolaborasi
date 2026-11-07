import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import type { AgentId, Candidate, Format, Source, Usage } from "./types.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY,
    topics TEXT NOT NULL,
    instruction TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY,
    search_id INTEGER NOT NULL REFERENCES searches(id),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    why_hot TEXT NOT NULL,
    sources TEXT NOT NULL,
    published_at TEXT NOT NULL,
    selected INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id),
    formats TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );
  CREATE TABLE IF NOT EXISTS outputs (
    id INTEGER PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id),
    agent TEXT NOT NULL,
    format TEXT NOT NULL,
    brief TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    review_status TEXT NOT NULL DEFAULT 'menunggu',
    review_notes TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 0,
    approved INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    job_id INTEGER,
    agent TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    web_searches INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Proses yang masih "running" saat server mati tidak akan pernah selesai: tandai gagal.
db.exec(`
  UPDATE searches SET status = 'failed', error = 'Terhenti karena server dimatikan. Silakan cari lagi.'
    WHERE status = 'running';
  UPDATE jobs SET status = 'failed', error = 'Terhenti karena server dimatikan.', finished_at = datetime('now')
    WHERE status = 'running';
`);

type Row = Record<string, unknown>;

const toCandidate = (r: Row): Candidate => ({
  id: Number(r.id),
  search_id: Number(r.search_id),
  title: String(r.title),
  summary: String(r.summary),
  why_hot: String(r.why_hot),
  sources: JSON.parse(String(r.sources)) as Source[],
  published_at: String(r.published_at),
  selected: Boolean(r.selected),
});

const toOutput = (r: Row) => ({ ...r, approved: Boolean(r.approved) });

export const repo = {
  createSearch(topics: string[], instruction: string) {
    const res = db
      .prepare("INSERT INTO searches (topics, instruction, status) VALUES (?, ?, 'running')")
      .run(JSON.stringify(topics), instruction);
    return Number(res.lastInsertRowid);
  },
  finishSearch(id: number, status: "done" | "failed", error?: string) {
    db.prepare("UPDATE searches SET status = ?, error = ? WHERE id = ?").run(status, error ?? null, id);
  },
  addCandidate(searchId: number, c: Omit<Candidate, "id" | "search_id" | "selected">) {
    db.prepare(
      "INSERT INTO candidates (search_id, title, summary, why_hot, sources, published_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(searchId, c.title, c.summary, c.why_hot, JSON.stringify(c.sources), c.published_at);
  },
  candidate(id: number): Candidate | undefined {
    const r = db.prepare("SELECT * FROM candidates WHERE id = ?").get(id);
    return r ? toCandidate(r) : undefined;
  },

  createJob(candidateId: number, formats: Format[]) {
    db.prepare("UPDATE candidates SET selected = 1 WHERE id = ?").run(candidateId);
    const res = db
      .prepare("INSERT INTO jobs (candidate_id, formats, status) VALUES (?, ?, 'running')")
      .run(candidateId, JSON.stringify(formats));
    return Number(res.lastInsertRowid);
  },
  finishJob(id: number, status: "done" | "failed", error?: string) {
    db.prepare("UPDATE jobs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?").run(
      status,
      error ?? null,
      id,
    );
  },
  /** Tandai produksi selesai bila semua format sudah berisi konten. */
  completeJobIfDone(jobId: number) {
    const r = db.prepare("SELECT COUNT(*) AS n FROM outputs WHERE job_id = ? AND content = ''").get(jobId);
    if (Number(r?.n) === 0) this.finishJob(jobId, "done");
  },
  jobCandidateId(jobId: number): number | undefined {
    const r = db.prepare("SELECT candidate_id FROM jobs WHERE id = ?").get(jobId);
    return r ? Number(r.candidate_id) : undefined;
  },
  createOutput(jobId: number, agent: AgentId, format: Format, brief: string) {
    const res = db
      .prepare("INSERT INTO outputs (job_id, agent, format, brief) VALUES (?, ?, ?, ?)")
      .run(jobId, agent, format, brief);
    return Number(res.lastInsertRowid);
  },
  output(id: number) {
    const r = db.prepare("SELECT * FROM outputs WHERE id = ?").get(id);
    return r ? (toOutput(r) as unknown as OutputRow) : undefined;
  },
  setOutputContent(id: number, content: string, revision: number) {
    db.prepare("UPDATE outputs SET content = ?, revision = ?, review_status = 'menunggu' WHERE id = ?").run(
      content,
      revision,
      id,
    );
  },
  setReview(id: number, status: "lolos" | "revisi", notes: string) {
    db.prepare("UPDATE outputs SET review_status = ?, review_notes = ? WHERE id = ?").run(status, notes, id);
  },
  approve(id: number) {
    db.prepare("UPDATE outputs SET approved = 1 WHERE id = ?").run(id);
  },

  logEvent(e: { job_id?: number | null; agent: string; type: string; message: string } & Partial<Usage>) {
    const res = db
      .prepare(
        "INSERT INTO events (job_id, agent, type, message, input_tokens, output_tokens, web_searches) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        e.job_id ?? null,
        e.agent,
        e.type,
        e.message,
        e.input_tokens ?? 0,
        e.output_tokens ?? 0,
        e.web_searches ?? 0,
      );
    return db.prepare("SELECT * FROM events WHERE id = ?").get(Number(res.lastInsertRowid));
  },

  /** Ringkasan untuk panel: pencarian + kandidat, produksi + hasil, log terbaru. */
  snapshot() {
    const searches = db.prepare("SELECT * FROM searches ORDER BY id DESC LIMIT 20").all();
    const candidates = db
      .prepare("SELECT * FROM candidates WHERE search_id IN (SELECT id FROM searches ORDER BY id DESC LIMIT 20)")
      .all()
      .map(toCandidate);
    const jobs = db
      .prepare(
        `SELECT j.*, c.title AS candidate_title, c.sources AS candidate_sources,
           (SELECT COALESCE(SUM(input_tokens), 0) FROM events e WHERE e.job_id = j.id) AS input_tokens,
           (SELECT COALESCE(SUM(output_tokens), 0) FROM events e WHERE e.job_id = j.id) AS output_tokens
         FROM jobs j JOIN candidates c ON c.id = j.candidate_id ORDER BY j.id DESC LIMIT 20`,
      )
      .all()
      .map((j) => ({
        ...j,
        formats: JSON.parse(String(j.formats)),
        candidate_sources: JSON.parse(String(j.candidate_sources)),
      }));
    const outputs = db
      .prepare("SELECT * FROM outputs WHERE job_id IN (SELECT id FROM jobs ORDER BY id DESC LIMIT 20)")
      .all()
      .map(toOutput);
    const events = db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT 200").all().reverse();
    return {
      searches: searches.map((s) => ({ ...s, topics: JSON.parse(String(s.topics)) })),
      candidates,
      jobs,
      outputs,
      events,
    };
  },

  jobExport(jobId: number) {
    const job = db
      .prepare("SELECT j.*, c.title, c.sources FROM jobs j JOIN candidates c ON c.id = j.candidate_id WHERE j.id = ?")
      .get(jobId);
    if (!job) return undefined;
    const outputs = db.prepare("SELECT * FROM outputs WHERE job_id = ? AND approved = 1").all(jobId);
    return { job, outputs };
  },
};

export interface OutputRow {
  id: number;
  job_id: number;
  agent: AgentId;
  format: Format;
  brief: string;
  content: string;
  review_status: string;
  review_notes: string;
  revision: number;
  approved: boolean;
}
