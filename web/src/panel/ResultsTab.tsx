import { useState } from "react";
import { post, useStore } from "../store";
import { FORMAT_LABEL, type Job, type Output } from "../types";

const REVIEW_LABEL = { menunggu: "menunggu cek", lolos: "lolos Editor", revisi: "catatan Editor" } as const;

function OutputCard({ o, busy }: { o: Output; busy: boolean }) {
  const [revising, setRevising] = useState(false);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(o.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article className="card output" id={`output-${o.id}`}>
      <header>
        <h4>{FORMAT_LABEL[o.format]}</h4>
        <span className={`pill ${o.review_status}`}>{REVIEW_LABEL[o.review_status]}</span>
        {o.revision > 0 && <span className="pill">revisi {o.revision}</span>}
        {o.approved && <span className="pill approved">disetujui</span>}
      </header>
      {o.content ? <pre className="content">{o.content}</pre> : <p className="muted">Sedang ditulis…</p>}
      {o.review_notes && (
        <p className="muted small">
          <strong>Editor:</strong> {o.review_notes}
        </p>
      )}
      {o.content && (
        <div className="actions">
          <button className="btn" onClick={() => void copy()}>
            {copied ? "Tersalin" : "Salin"}
          </button>
          {!o.approved && (
            <button className="btn" onClick={() => void post(`/api/outputs/${o.id}/approve`)}>
              Setujui
            </button>
          )}
          <button className="btn" disabled={busy} onClick={() => setRevising(!revising)}>
            Minta revisi
          </button>
        </div>
      )}
      {revising && (
        <div className="revise">
          <textarea
            rows={2}
            placeholder="Apa yang perlu diubah?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            className="btn primary"
            disabled={busy || !notes.trim()}
            onClick={() =>
              void post(`/api/outputs/${o.id}/revise`, { notes }).then((ok) => {
                if (ok) {
                  setRevising(false);
                  setNotes("");
                }
              })
            }
          >
            Kirim ke penulis
          </button>
        </div>
      )}
    </article>
  );
}

function JobBlock({ job, open }: { job: Job; open: boolean }) {
  const all = useStore((s) => s.outputs);
  const outputs = all.filter((o) => o.job_id === job.id);
  const busy = useStore((s) => s.busy);
  const tokens = job.input_tokens + job.output_tokens;
  return (
    <details className="search" open={open}>
      <summary>
        <span>{job.candidate_title}</span>
        <span className={`pill ${job.status}`}>
          {job.status === "running" ? "dikerjakan…" : job.status === "failed" ? "ada yang gagal" : "selesai"}
        </span>
      </summary>
      <p className="muted small">
        {tokens > 0 && `${tokens.toLocaleString("id-ID")} token · `}
        <a href={`/api/jobs/${job.id}/export.md`}>Ekspor yang disetujui (.md)</a>
      </p>
      {outputs.map((o) => (
        <OutputCard key={o.id} o={o} busy={busy} />
      ))}
    </details>
  );
}

export function ResultsTab() {
  const jobs = useStore((s) => s.jobs);
  if (!jobs.length) return <p className="muted center tab-body">Belum ada konten. Pilih berita di tab Tugas.</p>;
  return (
    <div className="tab-body">
      {jobs.map((j, i) => (
        <JobBlock key={j.id} job={j} open={i === 0} />
      ))}
    </div>
  );
}
