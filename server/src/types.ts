export const AGENTS = ["manajer", "artikel", "caption", "thread", "video", "editor"] as const;
export type AgentId = (typeof AGENTS)[number];

export const FORMATS = ["artikel", "caption", "thread", "video"] as const;
export type Format = (typeof FORMATS)[number];

export const TOPICS = ["Indonesia", "Teknologi & AI", "Hiburan & viral", "Olahraga"] as const;

export type AgentStatus = "santai" | "mencari" | "menulis" | "mengecek" | "menunggu" | "gagal";

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  note: string;
}

export interface Source {
  title: string;
  url: string;
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

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
}
