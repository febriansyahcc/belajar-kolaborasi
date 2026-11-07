import { create } from "zustand";
import { FOCUS_OPTIONS, type CameraFocus } from "./layout";
import type { AgentId, AgentState, LogEvent, ServerState } from "./types";

export type Tab = "tugas" | "hasil" | "log";

interface Store extends Omit<ServerState, "agents"> {
  loaded: boolean;
  connected: boolean;
  agents: Record<AgentId, AgentState>;
  tab: Tab;
  selected: AgentId | null;
  hovered: AgentId | null;
  focus: CameraFocus;
  error: string | null;
  setTab(tab: Tab): void;
  select(id: AgentId | null): void;
  hover(id: AgentId | null): void;
  setFocus(f: CameraFocus): void;
  setError(e: string | null): void;
}

const emptyAgents = {} as Record<AgentId, AgentState>;

export const useStore = create<Store>()((set) => ({
  loaded: false,
  connected: false,
  simulasi: true,
  provider: "simulasi",
  busy: false,
  models: {},
  agents: emptyAgents,
  searches: [],
  candidates: [],
  jobs: [],
  outputs: [],
  events: [],
  tab: "tugas",
  selected: null,
  hovered: null,
  focus: FOCUS_OPTIONS[0],
  error: null,
  setTab: (tab) => set({ tab }),
  select: (selected) => set({ selected }),
  hover: (hovered) => set({ hovered }),
  setFocus: (focus) => set({ focus }),
  setError: (error) => set({ error }),
}));

const toMap = (list: AgentState[]) => Object.fromEntries(list.map((a) => [a.id, a])) as Record<AgentId, AgentState>;

export async function loadState() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`Server menjawab ${res.status}`);
  const s = (await res.json()) as ServerState;
  useStore.setState({ ...s, agents: toMap(s.agents), loaded: true });
}

/** Sambungan real-time ke server. EventSource otomatis menyambung ulang bila putus. */
export function connectEvents() {
  const es = new EventSource("/api/events");
  es.onopen = () => {
    useStore.setState({ connected: true });
    void loadState().catch(() => undefined);
  };
  es.onerror = () => useStore.setState({ connected: false });
  es.addEventListener("agents", (e) => {
    useStore.setState({ agents: toMap(JSON.parse(e.data) as AgentState[]) });
  });
  es.addEventListener("agent", (e) => {
    const a = JSON.parse(e.data) as AgentState;
    useStore.setState((s) => ({ agents: { ...s.agents, [a.id]: a } }));
  });
  es.addEventListener("log", (e) => {
    const ev = JSON.parse(e.data) as LogEvent;
    useStore.setState((s) => ({ events: [...s.events.slice(-299), ev] }));
  });
  es.addEventListener("refresh", () => void loadState().catch(() => undefined));
  return () => es.close();
}

/** POST ke server; pesan error dari server ditampilkan di panel. */
export async function post(url: string, body: unknown = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    useStore.getState().setError(data.error ?? `Gagal (${res.status})`);
    return false;
  }
  useStore.getState().setError(null);
  await loadState();
  return true;
}
