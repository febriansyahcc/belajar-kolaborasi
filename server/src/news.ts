/**
 * Ambil judul berita terbaru dari RSS Google News (gratis, tanpa API key).
 * Dipakai Manajer di paket gratis Gemini, karena Google Search grounding
 * tidak tersedia di Free Tier untuk model Gemini 3 ke atas.
 */

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  published: string;
}

const BASE = "https://news.google.com/rss";
const LOCALE = "hl=id&gl=ID&ceid=ID:id";

// null = feed berita utama Indonesia.
const TOPIC_QUERY: Record<string, string | null> = {
  Indonesia: null,
  "Teknologi & AI": 'teknologi OR "kecerdasan buatan" OR AI',
  "Hiburan & viral": "viral OR selebriti OR hiburan",
  Olahraga: "olahraga OR sepak bola OR timnas",
};

const feedUrl = (query: string | null) =>
  query ? `${BASE}/search?q=${encodeURIComponent(`${query} when:2d`)}&${LOCALE}` : `${BASE}?${LOCALE}`;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "");

export function parseRss(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const raw = m[1];
    const source = tag(raw, "source");
    let title = tag(raw, "title");
    // Judul Google News berakhiran " - Nama Media"; buang supaya tidak dobel.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const url = tag(raw, "link");
    if (!title || !url) continue;
    items.push({ title, source, url, published: tag(raw, "pubDate") });
    if (items.length >= limit) break;
  }
  return items;
}

async function fetchFeed(query: string | null, limit: number): Promise<NewsItem[]> {
  const res = await fetch(feedUrl(query), { headers: { "User-Agent": "kantor-redaksi-ai/1.0" } });
  if (!res.ok) throw new Error(`Google News menjawab ${res.status}`);
  return parseRss(await res.text(), limit);
}

/** Gabungan berita dari arahan pemilik dan topik terpilih, tanpa judul ganda. */
export async function fetchNews(topics: string[], instruction: string): Promise<NewsItem[]> {
  const queries: (string | null)[] = [];
  if (instruction) queries.push(instruction);
  for (const t of topics) if (t in TOPIC_QUERY) queries.push(TOPIC_QUERY[t]);

  const perFeed = instruction ? 10 : 12;
  const results = await Promise.allSettled(queries.map((q) => fetchFeed(q, perFeed)));
  const seen = new Set<string>();
  const all: NewsItem[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      const key = item.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
    }
  }
  if (!all.length) {
    const firstError = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    const reason = firstError?.reason as (Error & { cause?: Error }) | undefined;
    const detail = reason ? `: ${reason.cause?.message ?? reason.message}` : ".";
    throw new Error(`Tidak ada berita dari Google News${detail} Cek koneksi internet.`);
  }
  return all.slice(0, 40);
}
