import type { Response } from "express";
import { repo } from "./db.js";
import { AGENTS, type AgentId, type AgentState, type AgentStatus, type Usage } from "./types.js";

/** Status semua karyawan, hanya di memori: saat server dinyalakan ulang semua kembali santai. */
const agents = new Map<AgentId, AgentState>(AGENTS.map((id) => [id, { id, status: "santai", note: "" }]));
const clients = new Set<Response>();

function send(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

export const bus = {
  subscribe(res: Response) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: agents\ndata: ${JSON.stringify([...agents.values()])}\n\n`);
    clients.add(res);
    res.on("close", () => clients.delete(res));
  },

  agents: () => [...agents.values()],

  setAgent(id: AgentId, status: AgentStatus, note = "") {
    const state = { id, status, note };
    agents.set(id, state);
    send("agent", state);
  },

  log(agent: AgentId | "sistem", message: string, opts: { jobId?: number; type?: string; usage?: Usage } = {}) {
    const row = repo.logEvent({
      job_id: opts.jobId ?? null,
      agent,
      type: opts.type ?? "info",
      message,
      ...opts.usage,
    });
    send("log", row);
  },

  /** Minta panel memuat ulang data dari database. */
  refresh() {
    send("refresh", {});
  },
};
