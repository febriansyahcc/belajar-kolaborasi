import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import { bus } from "./bus.js";
import { config } from "./config.js";
import type { Ask } from "./llm.js";
import type { Source, Usage } from "./types.js";

let client: GoogleGenAI | undefined;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export const askGemini: Ask = async (opts) => {
  const model = config.models[opts.role];
  const cfg: GenerateContentConfig = { systemInstruction: opts.system };
  if (opts.maxTokens) cfg.maxOutputTokens = opts.maxTokens;
  // Google Search grounding: model mencari sendiri dan melaporkan sumbernya.
  if (opts.search) cfg.tools = [{ googleSearch: {} }];
  if (opts.schema) {
    cfg.responseMimeType = "application/json";
    cfg.responseJsonSchema = opts.schema;
  }

  const res = await getClient().models.generateContent({ model, contents: opts.prompt, config: cfg });

  const candidate = res.candidates?.[0];
  const text = res.text?.trim() ?? "";
  if (!candidate || !text) {
    const why = res.promptFeedback?.blockReason ?? candidate?.finishReason ?? "jawaban kosong";
    throw new Error(`Gemini tidak memberi jawaban (${why}).`);
  }

  const u = res.usageMetadata;
  const grounding = candidate.groundingMetadata;
  const usage: Usage = {
    input_tokens: (u?.promptTokenCount ?? 0) + (u?.toolUsePromptTokenCount ?? 0),
    output_tokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    web_searches: grounding?.webSearchQueries?.length ?? 0,
  };

  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const chunk of grounding?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title: chunk.web?.title ?? chunk.web?.domain ?? uri, url: uri });
  }

  const searchNote = usage.web_searches ? `, ${usage.web_searches} kueri pencarian` : "";
  bus.log(opts.agent, `Pakai ${model}: ${usage.input_tokens} token masuk, ${usage.output_tokens} token keluar${searchNote}`, {
    jobId: opts.jobId,
    type: "api",
    usage,
  });

  return { text, usage, sources };
};
