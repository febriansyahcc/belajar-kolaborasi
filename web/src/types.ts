export type AgentId = "manajer" | "artikel" | "caption" | "thread" | "video" | "editor";
export type Format = "artikel" | "caption" | "thread" | "video";
export type AgentStatus = "santai" | "mencari" | "menulis" | "mengecek" | "menunggu" | "gagal";

export const TOPICS = ["Indonesia", "Teknologi & AI", "Hiburan & viral", "Olahraga"] as const;
export const FORMATS: Format[] = ["artikel", "caption", "thread", "video"];

export const FORMAT_LABEL: Record<Format, string> = {
  artikel: "Artikel",
  caption: "Caption IG/TikTok",
  thread: "Thread X/Threads",
  video: "Naskah video",
};

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  note: string;
}

export interface Source {
  title: string;
  url: string;
}

export interface Search {
  id: number;
  topics: string[];
  instruction: string;
  status: "running" | "done" | "failed";
  error: string | null;
  created_at: string;
}

export interface Candidate {
  id: number;
  search_id: number;
  title: string;
  summary: string;
  why_hot: string;
  sources: Source[];
  published_at: string;
  selected: boolean;
}

export interface Job {
  id: number;
  candidate_id: number;
  candidate_title: string;
  candidate_sources: Source[];
  formats: Format[];
  status: "running" | "done" | "failed";
  error: string | null;
  created_at: string;
  input_tokens: number;
  output_tokens: number;
}

export interface Output {
  id: number;
  job_id: number;
  agent: AgentId;
  format: Format;
  brief: string;
  content: string;
  review_status: "menunggu" | "lolos" | "revisi";
  review_notes: string;
  revision: number;
  approved: boolean;
}

export interface LogEvent {
  id: number;
  job_id: number | null;
  agent: AgentId | "sistem";
  type: string;
  message: string;
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
  created_at: string;
}

export interface ServerState {
  simulasi: boolean;
  busy: boolean;
  models: Record<string, string>;
  agents: AgentState[];
  searches: Search[];
  candidates: Candidate[];
  jobs: Job[];
  outputs: Output[];
  events: LogEvent[];
}
