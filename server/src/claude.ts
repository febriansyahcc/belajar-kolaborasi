import Anthropic from "@anthropic-ai/sdk";
import { bus } from "./bus.js";
import { config } from "./config.js";
import type { AgentId, Usage } from "./types.js";

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

// Model yang mendukung fallback sisi server saat permintaan ditolak filter keamanan.
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export interface CallOptions {
  agent: AgentId;
  model: string;
  system: string;
  prompt: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** Aktifkan web search dengan batas jumlah pencarian. */
  webSearch?: number;
  /** JSON schema untuk structured output. */
  schema?: Record<string, unknown>;
  jobId?: number;
}

export async function callClaude(opts: CallOptions): Promise<{ text: string; usage: Usage }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  const usage: Usage = { input_tokens: 0, output_tokens: 0, web_searches: 0 };
  const texts: string[] = [];

  for (let turn = 0; turn < 5; turn++) {
    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages,
      output_config: {
        effort: opts.effort ?? "medium",
        ...(opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {}),
      },
    };
    if (opts.webSearch) {
      params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: opts.webSearch }];
    }
    if (FALLBACK_MODELS.has(opts.model)) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }

    const res = await getClient().beta.messages.create(params);

    usage.input_tokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0);
    usage.output_tokens += res.usage.output_tokens;
    usage.web_searches += res.usage.server_tool_use?.web_search_requests ?? 0;

    if (res.stop_reason === "refusal") {
      throw new Error(`Permintaan ditolak model (${res.stop_details?.category ?? "tanpa kategori"}).`);
    }
    for (const block of res.content) if (block.type === "text") texts.push(block.text);

    // Web search yang panjang bisa berhenti di tengah; kirim balik supaya server melanjutkan.
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    if (res.stop_reason === "max_tokens") {
      throw new Error("Jawaban model terpotong (max_tokens). Coba ulangi.");
    }
    break;
  }

  const searchNote = usage.web_searches ? `, ${usage.web_searches} pencarian web` : "";
  bus.log(opts.agent, `Pakai ${opts.model}: ${usage.input_tokens} token masuk, ${usage.output_tokens} token keluar${searchNote}`, {
    jobId: opts.jobId,
    type: "api",
    usage,
  });

  return { text: texts.join("\n").trim(), usage };
}

export async function callJson<T>(opts: CallOptions & { schema: Record<string, unknown> }): Promise<T> {
  const { text } = await callClaude(opts);
  return JSON.parse(text) as T;
}

export const models = config.models;
