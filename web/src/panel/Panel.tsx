import { AGENT_INFO, STATUS_LABEL } from "../layout";
import { useStore, type Tab } from "../store";
import type { AgentId } from "../types";
import { agentName, LogTab, timeOf } from "./LogTab";
import { ResultsTab } from "./ResultsTab";
import { TaskTab } from "./TaskTab";

const TABS: { id: Tab; label: string }[] = [
  { id: "tugas", label: "Tugas" },
  { id: "hasil", label: "Hasil" },
  { id: "log", label: "Log" },
];

function AgentCard({ id }: { id: AgentId }) {
  const info = AGENT_INFO[id];
  const state = useStore((s) => s.agents[id]);
  const outputs = useStore((s) => s.outputs);
  const events = useStore((s) => s.events);
  const select = useStore((s) => s.select);
  const lastOutput = [...outputs].reverse().find((o) => o.agent === id && o.content);
  const lastEvents = events.filter((e) => e.agent === id).slice(-3);

  return (
    <section className="card agent-card" style={{ borderColor: info.color }}>
      <header>
        <span className="dot" style={{ background: info.color }} />
        <h3>{info.name}</h3>
        <button className="btn ghost" onClick={() => select(null)} aria-label="Tutup">
          ✕
        </button>
      </header>
      <p className="muted small">{info.role}</p>
      <p>
        <strong>{STATUS_LABEL[state?.status ?? "santai"]}</strong>
        {state?.note ? ` · ${state.note}` : ""}
      </p>
      {lastOutput ? (
        <pre className="content short">{lastOutput.content}</pre>
      ) : (
        lastEvents.map((e) => (
          <p key={e.id} className="small">
            <span className="muted">{timeOf(e.created_at)}</span> {e.message}
          </p>
        ))
      )}
      {!lastOutput && !lastEvents.length && <p className="muted small">Belum ada pekerjaan {agentName(id)}.</p>}
    </section>
  );
}

export function Panel() {
  const { tab, setTab, selected, simulasi, provider, models, connected, busy, error, setError } = useStore();
  return (
    <aside className="panel">
      <header className="panel-head">
        <div>
          <h1>Kantor Redaksi AI</h1>
          <p className="muted small">
            <span className={`status-dot ${connected ? "on" : ""}`} />
            {connected
              ? simulasi
                ? "Mode simulasi"
                : `${provider === "gemini" ? "Gemini" : "Claude"} · ${models.manajer}`
              : "Menyambung ke server…"}
            {busy && " · tim sedang bekerja"}
          </p>
        </div>
      </header>
      {simulasi && connected && (
        <p className="notice">
          Belum ada API key, jadi semua hasil adalah contoh. Isi <code>GEMINI_API_KEY</code> (atau{" "}
          <code>ANTHROPIC_API_KEY</code>) di <code>server/.env</code> lalu jalankan ulang server.
        </p>
      )}
      {error && (
        <p className="error" onClick={() => setError(null)}>
          {error}
        </p>
      )}
      {selected && <AgentCard id={selected} />}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "tugas" && <TaskTab />}
      {tab === "hasil" && <ResultsTab />}
      {tab === "log" && <LogTab />}
    </aside>
  );
}
