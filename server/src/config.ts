import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_DIR = path.resolve(here, "..");
export const ROOT_DIR = path.resolve(SERVER_DIR, "..");

dotenv.config({ path: path.join(SERVER_DIR, ".env"), quiet: true });

const env = process.env;

export type Provider = "claude" | "gemini" | "simulasi";

/** PROVIDER di .env menang; kalau kosong dipilih otomatis dari API key yang tersedia. */
function pickProvider(): Provider {
  if (env.SIMULASI === "1") return "simulasi";
  const p = env.PROVIDER?.trim().toLowerCase();
  if (p === "claude" || p === "gemini" || p === "simulasi") return p;
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY) return "claude";
  return "simulasi";
}

const provider = pickProvider();

/** Peran model: Manajer & Editor butuh penilaian, penulis & ekstraksi cukup model ringan. */
export type ModelRole = "manajer" | "editor" | "penulis" | "ringan";

const MODELS: Record<Exclude<Provider, "simulasi">, Record<ModelRole, string>> = {
  claude: {
    manajer: env.MODEL_MANAJER ?? "claude-sonnet-5-5",
    editor: env.MODEL_EDITOR ?? "claude-sonnet-5-5",
    penulis: env.MODEL_PENULIS ?? "claude-haiku-5-5",
    ringan: env.MODEL_RINGAN ?? "claude-haiku-5-5",
  },
  gemini: {
    manajer: env.GEMINI_MODEL_MANAJER ?? "gemini-3.8-flash",
    editor: env.GEMINI_MODEL_EDITOR ?? "gemini-3.8-flash",
    // Model ringan untuk penulis: kuota per menit dihitung per model, jadi beban terbagi.
    penulis: env.GEMINI_MODEL_PENULIS ?? "gemini-3.5-flash-lite",
    ringan: env.GEMINI_MODEL_RINGAN ?? "gemini-3.5-flash-lite",
  },
};

export const config = {
  port: Number(env.PORT ?? 3001),
  dbPath: path.resolve(ROOT_DIR, env.DB_PATH ?? "data/redaksi.db"),
  provider,
  simulasi: provider === "simulasi",
  maxWebSearch: Number(env.MAX_WEB_SEARCH ?? 5),
  /**
   * Cara Manajer Gemini mencari berita. "rss" (default): judul dari Google News RSS, gratis.
   * "google": Google Search grounding, hanya tersedia di paket berbayar untuk Gemini 3 ke atas.
   */
  geminiSearch: env.GEMINI_SEARCH?.trim().toLowerCase() === "google" ? "google" : "rss",
  /** Dipakai bila model Gemini utama terus menjawab 503 (sibuk). Kosongkan untuk mematikan. */
  geminiFallback: env.GEMINI_MODEL_CADANGAN ?? "gemini-3.5-flash-lite",
  /** Batas permintaan per menit per model yang dijaga aplikasi (Free Tier gemini-3.8-flash: 5). */
  geminiRpm: Math.max(1, Number(env.GEMINI_RPM ?? 5)),
  models: provider === "simulasi" ? ({} as Record<ModelRole, string>) : MODELS[provider],
};
