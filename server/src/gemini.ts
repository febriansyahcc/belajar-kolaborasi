import { ApiError, GoogleGenAI, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";
import { bus } from "./bus.js";
import { config } from "./config.js";
import type { Ask } from "./llm.js";
import type { Source, Usage } from "./types.js";

let client: GoogleGenAI | undefined;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const MAX_RETRY = 3;
// Status yang menurut panduan Gemini API layak dicoba ulang: server sibuk atau gangguan sementara.
const TRANSIENT = new Set([408, 500, 502, 503, 504]);

/** Model sedang penuh setelah beberapa kali dicoba; boleh pindah ke model cadangan. */
class OverloadedError extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface QuotaInfo {
  status: number;
  message: string;
  /** Nama kuota yang terlampaui, misalnya batas per menit atau per hari. */
  quotaIds: string[];
  /** True bila batasnya 0: model/fitur ini tidak punya kuota di akun tersebut. */
  zeroQuota: boolean;
  retryMs?: number;
}

/** Error API Google datang sebagai JSON; ambil info kuota dan saran waktu tunggu. */
function readApiError(e: ApiError): QuotaInfo {
  const info: QuotaInfo = { status: e.status, message: e.message, quotaIds: [], zeroQuota: false };
  try {
    const body = JSON.parse(e.message) as {
      error?: { message?: string; details?: Array<Record<string, unknown>> };
    };
    info.message = body.error?.message ?? e.message;
    for (const d of body.error?.details ?? []) {
      const type = String(d["@type"] ?? "");
      if (type.endsWith("QuotaFailure")) {
        for (const v of (d.violations as Array<Record<string, unknown>> | undefined) ?? []) {
          if (v.quotaId) info.quotaIds.push(String(v.quotaId));
          if (String(v.quotaValue ?? "") === "0") info.zeroQuota = true;
        }
      }
      if (type.endsWith("RetryInfo")) {
        const secs = parseFloat(String(d.retryDelay ?? ""));
        if (Number.isFinite(secs)) info.retryMs = Math.ceil(secs * 1000);
      }
    }
  } catch {
    // bukan JSON, pakai pesan apa adanya
  }
  return info;
}

export async function withQuotaRetry(
  call: () => Promise<GenerateContentResponse>,
  model: string,
  agent: Parameters<typeof bus.log>[0],
  jobId?: number,
): Promise<GenerateContentResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      const q = readApiError(e);

      if (TRANSIENT.has(q.status)) {
        if (attempt >= MAX_RETRY) {
          throw new OverloadedError(`Gemini ${q.status} pada ${model}: ${q.message}`);
        }
        // Jeda makin lama (2, 4, 8 detik) plus acak, sesuai saran panduan Gemini API.
        const wait = 2000 * 2 ** attempt + Math.random() * 1000;
        bus.log(agent, `${model} sedang sibuk (${q.status}), coba lagi dalam ${Math.round(wait / 1000)} detik…`, {
          jobId,
          type: "error",
        });
        await sleep(wait);
        continue;
      }
      if (q.status !== 429) throw new Error(`Gemini ${q.status}: ${q.message}`);

      const kuota = q.quotaIds.length ? ` Kuota: ${q.quotaIds.join(", ")}.` : "";
      if (q.zeroQuota) {
        throw new Error(
          `Akun Gemini ini tidak punya kuota untuk ${model}.${kuota} Ganti GEMINI_MODEL_* di server/.env ` +
            "ke model yang kuotanya tidak 0 (cek ai.dev/rate-limit), atau aktifkan billing di AI Studio.",
        );
      }
      const wait = q.retryMs ?? 10_000 * 2 ** attempt;
      // Batas per menit biasanya pulih dalam hitungan detik; batas harian tidak, jadi jangan ditunggu.
      if (attempt >= MAX_RETRY || wait > 65_000) {
        throw new Error(`Batas pemakaian Gemini tercapai untuk ${model}.${kuota} Coba lagi nanti. Detail: ${q.message}`);
      }
      bus.log(agent, `Kena batas per menit Gemini, coba lagi dalam ${Math.round(wait / 1000)} detik…`, { jobId, type: "error" });
      await sleep(wait);
    }
  }
}

export const askGemini: Ask = async (opts) => {
  let model = config.models[opts.role];
  const cfg: GenerateContentConfig = { systemInstruction: opts.system };
  if (opts.maxTokens) cfg.maxOutputTokens = opts.maxTokens;
  // Google Search grounding: model mencari sendiri dan melaporkan sumbernya.
  if (opts.search) cfg.tools = [{ googleSearch: {} }];
  if (opts.schema) {
    cfg.responseMimeType = "application/json";
    cfg.responseJsonSchema = opts.schema;
  }

  const run = (m: string) =>
    withQuotaRetry(
      () => getClient().models.generateContent({ model: m, contents: opts.prompt, config: cfg }),
      m,
      opts.agent,
      opts.jobId,
    );

  let res: GenerateContentResponse;
  try {
    res = await run(model);
  } catch (e) {
    const cadangan = config.geminiFallback;
    if (!(e instanceof OverloadedError) || !cadangan || cadangan === model) throw e;
    bus.log(opts.agent, `${model} masih penuh, pindah ke model cadangan ${cadangan}.`, { jobId: opts.jobId, type: "error" });
    model = cadangan;
    res = await run(model);
  }

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
