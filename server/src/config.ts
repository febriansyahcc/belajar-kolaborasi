import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_DIR = path.resolve(here, "..");
export const ROOT_DIR = path.resolve(SERVER_DIR, "..");

dotenv.config({ path: path.join(SERVER_DIR, ".env"), quiet: true });

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3001),
  dbPath: path.resolve(ROOT_DIR, env.DB_PATH ?? "data/redaksi.db"),
  // Mode simulasi aktif bila tidak ada API key, atau dipaksa lewat SIMULASI=1.
  simulasi: env.SIMULASI === "1" || !env.ANTHROPIC_API_KEY,
  maxWebSearch: Number(env.MAX_WEB_SEARCH ?? 5),
  models: {
    manajer: env.MODEL_MANAJER ?? "claude-sonnet-5-5",
    editor: env.MODEL_EDITOR ?? "claude-sonnet-5-5",
    penulis: env.MODEL_PENULIS ?? "claude-haiku-5-5",
    ringan: env.MODEL_RINGAN ?? "claude-haiku-5-5",
  },
};
