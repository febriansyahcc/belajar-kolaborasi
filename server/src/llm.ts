import type { AgentId, Source, Usage } from "./types.js";
import type { ModelRole } from "./config.js";

/** Satu permintaan ke model bahasa, tidak bergantung penyedia (Claude atau Gemini). */
export interface AskOptions {
  agent: AgentId;
  role: ModelRole;
  system: string;
  prompt: string;
  /** Izinkan model mencari di web. */
  search?: boolean;
  /** JSON schema untuk keluaran terstruktur. */
  schema?: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  jobId?: number;
}

export interface AskResult {
  text: string;
  usage: Usage;
  /** Sumber web yang dipakai model (bila penyedia melaporkannya). */
  sources: Source[];
}

export type Ask = (opts: AskOptions) => Promise<AskResult>;
