import { useEffect, useRef } from "react";
import { AGENT_INFO } from "../layout";
import { useStore } from "../store";
import type { LogEvent } from "../types";

export const agentName = (a: LogEvent["agent"]) => (a === "sistem" ? "Sistem" : AGENT_INFO[a].name);

// Waktu dari SQLite berformat UTC "YYYY-MM-DD HH:MM:SS".
export const timeOf = (s: string) =>
  new Date(`${s.replace(" ", "T")}Z`).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

export function LogTab() {
  const events = useStore((s) => s.events);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [events.length]);

  if (!events.length) return <p className="muted center tab-body">Log masih kosong.</p>;
  return (
    <div className="tab-body log">
      {events.map((e) => (
        <div key={e.id} className={`log-row ${e.type}`}>
          <span className="time">{timeOf(e.created_at)}</span>
          <span className="who">{agentName(e.agent)}</span>
          <span className="msg">{e.message}</span>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
