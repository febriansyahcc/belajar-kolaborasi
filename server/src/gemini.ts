import { ApiError, GoogleGenAI, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";
import { bus } from "./bus.js";
import { config } from "./config.js";
import type { Ask } from "./llm.js";
import type { Source, Usage } from "./types.js";

let client: GoogleGenAI | undefined;
// Batas waktu 2 menit per permintaan supaya pencarian tidak menggantung selamanya.
const getClient = () =>
  (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 120_000 } }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type LogAgent = Parameters<typeof bus.log>[0];

// ---------- Antrean per model: jangan melewati batas permintaan per menit ----------

const WINDOW_MS = 60_000;
const history = new Map<string, number[]>();
const queues = new Map<string, Promise<unknown>>();

/**
 * Tunggu giliran supaya permintaan ke satu model tidak melebihi GEMINI_RPM per menit.
 * Paket gratis gemini-3.8-flash dibatasi 5 permintaan per menit per model.
 */
function waitForSlot(model: string, agent: LogAgent, jobId?: number): Promise<void> {
  const prev = queues.get(model) ?? Promise.resolve();
  const turn = prev.then(async () => {
    const times = history.get(model) ?? [];
    for (;;) {
      const now = Date.now();
      while (times.length && now - times[0] >= WINDOW_MS) times.shift();
      if (times.length < config.geminiRpm) break;
      const wait = WINDOW_MS - (now - times[0]) + 250;
      bus.log(agent, `Antre: batas ${config.geminiRpm} permintaan/menit untuk ${model}, tunggu ${Math.ceil(wait / 1000)} detik…`, {
        jobId,
      });
      await sleep(wait);
    }
    times.push(Date.now());
    history.set(model, times);
  });
  queues.set(
    model,
    turn.catch(() => undefined),
  );
  return turn;
}

// ---------- Membaca error Google ----------

// Status yang menurut panduan Gemini API layak dicoba ulang: server sibuk atau gangguan sementara.
const TRANSIENT = new Set([408, 500, 502, 503, 504]);
const MAX_TRANSIENT = 3;
const MAX_RATE_LIMIT = 4;

/** Model sedang penuh setelah beberapa kali dicoba; boleh pindah ke model cadangan. */
class OverloadedError extends Error {}

interface ApiErrorInfo {
  status: number;
  message: string;
  /** Nama kuota yang terlampaui, misalnya batas per menit atau per hari. */
  quotaIds: string[];
  /** True bila batasnya 0: model/fitur ini tidak punya kuota di akun tersebut. */
  zeroQuota: boolean;
  retryMs?: number;
}

/** Error API Google datang sebagai JSON; ambil info kuota dan saran waktu tunggu. */
function readApiError(e: ApiError): ApiErrorInfo {
  const info: ApiErrorInfo = { status: e.status, message: e.message, quotaIds: [], zeroQuota: false };
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

/** Batas waktu habis atau koneksi terputus: gangguan sementara, layak dicoba ulang. */
const isTimeout = (e: unknown) =>
  e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError" || /aborted|timed? ?out/i.test(e.message));

// ---------- Panggil model dengan antrean dan coba ulang ----------

export async function withQuotaRetry(
  call: () => Promise<GenerateContentResponse>,
  model: string,
  agent: LogAgent,
  jobId?: number,
): Promise<GenerateContentResponse> {
  // Hitungan terpisah: gangguan server dan batas per menit punya jatah coba ulang masing-masing.
  let transient = 0;
  let rateLimited = 0;
  for (;;) {
    await waitForSlot(model, agent, jobId);
    try {
      return await call();
    } catch (e) {
      const info = e instanceof ApiError ? readApiError(e) : undefined;

      if (isTimeout(e) || (info && TRANSIENT.has(info.status))) {
        const what = info ? `sibuk (${info.status})` : "lambat merespons";
        if (transient >= MAX_TRANSIENT) {
          throw new OverloadedError(`${model} ${what}: ${info?.message ?? (e as Error).message}`);
        }
        // Jeda makin lama (2, 4, 8 detik) plus acak, sesuai saran panduan Gemini API.
        const wait = 2000 * 2 ** transient + Math.random() * 1000;
        transient++;
        bus.log(agent, `${model} ${what}, coba lagi dalam ${Math.round(wait / 1000)} detik…`, { jobId, type: "error" });
        await sleep(wait);
        continue;
      }

      if (!info) throw e;
      if (info.status !== 429) throw new Error(`Gemini ${info.status}: ${info.message}`);

      const kuota = info.quotaIds.length ? ` Kuota: ${info.quotaIds.join(", ")}.` : "";
      if (info.zeroQuota) {
        throw new Error(
          `Akun Gemini ini tidak punya kuota untuk ${model}.${kuota} Ganti GEMINI_MODEL_* di server/.env ` +
            "ke model yang kuotanya tidak 0 (cek ai.dev/rate-limit), atau aktifkan billing di AI Studio.",
        );
      }
      const perDay = info.quotaIds.some((id) => /PerDay/i.test(id));
      // Ikuti saran waktu tunggu dari Google, minimal 5 detik supaya tidak langsung kena lagi.
      const wait = Math.max(info.retryMs ?? 15_000 * 2 ** rateLimited, 5_000) + Math.random() * 1000;
      if (perDay || rateLimited >= MAX_RATE_LIMIT || wait > 90_000) {
        throw new Error(
          `Batas ${perDay ? "harian" : "pemakaian"} Gemini tercapai untuk ${model}.${kuota} ` +
            (perDay ? "Kuota harian pulih tengah malam waktu Pasifik (sekitar 14.00–15.00 WIB)." : "Coba lagi nanti."),
        );
      }
      rateLimited++;
      bus.log(agent, `Kena batas per menit ${model}, coba lagi dalam ${Math.round(wait / 1000)} detik…`, {
        jobId,
        type: "error",
      });
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
