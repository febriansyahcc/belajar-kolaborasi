import Anthropic from "@anthropic-ai/sdk";
import { bus } from "./bus.js";
import { config } from "./config.js";
import type { Ask } from "./llm.js";
import type { Usage } from "./types.js";

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

// Model yang mendukung fallback sisi server saat permintaan ditolak filter keamanan.
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export const askClaude: Ask = async (opts) => {
  const model = config.models[opts.role];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  const usage: Usage = { input_tokens: 0, output_tokens: 0, web_searches: 0 };
  const texts: string[] = [];

  for (let turn = 0; turn < 5; turn++) {
    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages,
      output_config: {
        effort: opts.effort ?? "medium",
        ...(opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {}),
      },
    };
    if (opts.search) {
      params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: config.maxWebSearch }];
    }
    if (FALLBACK_MODELS.has(model)) {
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
  bus.log(opts.agent, `Pakai ${model}: ${usage.input_tokens} token masuk, ${usage.output_tokens} token keluar${searchNote}`, {
    jobId: opts.jobId,
    type: "api",
    usage,
  });

  // URL sumber sudah ditulis Claude di dalam teks laporannya.
  return { text: texts.join("\n").trim(), usage, sources: [] };
};
