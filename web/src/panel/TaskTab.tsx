import { useState } from "react";
import { post, useStore } from "../store";
import { FORMATS, FORMAT_LABEL, TOPICS, type Candidate, type Format, type Search } from "../types";

function CandidateCard({ c, formats, disabled }: { c: Candidate; formats: Format[]; disabled: boolean }) {
  return (
    <article className={`card candidate ${c.selected ? "is-picked" : ""}`}>
      <h4>{c.title}</h4>
      <p>{c.summary}</p>
      <p className="muted">
        <strong>Kenapa hangat:</strong> {c.why_hot}
      </p>
      <p className="muted small">Terbit: {c.published_at}</p>
      <ul className="sources">
        {c.sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title || s.url}
            </a>
          </li>
        ))}
      </ul>
      <button
        className="btn primary"
        disabled={disabled || !formats.length}
        onClick={() => void post(`/api/candidates/${c.id}/produce`, { formats }).then((ok) => ok && useStore.getState().setTab("hasil"))}
      >
        {c.selected ? "Produksi lagi" : "Pilih & produksi"}
      </button>
    </article>
  );
}

function SearchBlock({ s, open, formats }: { s: Search; open: boolean; formats: Format[] }) {
  const all = useStore((st) => st.candidates);
  const candidates = all.filter((c) => c.search_id === s.id);
  const busy = useStore((st) => st.busy);
  const label = s.instruction || s.topics.join(", ");
  return (
    <details className="search" open={open}>
      <summary>
        <span>{label}</span>
        <span className={`pill ${s.status}`}>
          {s.status === "running" ? "mencari…" : s.status === "failed" ? "gagal" : `${candidates.length} berita`}
        </span>
      </summary>
      {s.error && <p className="error">{s.error}</p>}
      {candidates.map((c) => (
        <CandidateCard key={c.id} c={c} formats={formats} disabled={busy} />
      ))}
    </details>
  );
}

export function TaskTab() {
  const busy = useStore((s) => s.busy);
  const searches = useStore((s) => s.searches);
  const [topics, setTopics] = useState<string[]>([...TOPICS]);
  const [instruction, setInstruction] = useState("");
  const [formats, setFormats] = useState<Format[]>(FORMATS);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="tab-body">
      <section className="card">
        <h3>Tugas untuk Manajer</h3>
        <div className="chips">
          {TOPICS.map((t) => (
            <label key={t} className={`chip ${topics.includes(t) ? "on" : ""}`}>
              <input type="checkbox" checked={topics.includes(t)} onChange={() => setTopics(toggle(topics, t))} />
              {t}
            </label>
          ))}
        </div>
        <textarea
          rows={2}
          placeholder="Opsional, misal: cari berita soal timnas minggu ini"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <button
          className="btn primary wide"
          disabled={busy || (!topics.length && !instruction.trim())}
          onClick={() => void post("/api/searches", { topics, instruction }).then((ok) => ok && setInstruction(""))}
        >
          {busy ? "Tim sedang bekerja…" : "🔍 Cari berita hangat"}
        </button>
      </section>

      <section className="card">
        <h3>Format yang dibuat</h3>
        <div className="chips">
          {FORMATS.map((f) => (
            <label key={f} className={`chip ${formats.includes(f) ? "on" : ""}`}>
              <input type="checkbox" checked={formats.includes(f)} onChange={() => setFormats(toggle(formats, f))} />
              {FORMAT_LABEL[f]}
            </label>
          ))}
        </div>
      </section>

      {searches.length === 0 && <p className="muted center">Belum ada pencarian. Mulai dari tombol di atas.</p>}
      {searches.map((s, i) => (
        <SearchBlock key={s.id} s={s} open={i === 0} formats={formats} />
      ))}
    </div>
  );
}
