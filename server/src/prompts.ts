import type { Candidate, Format } from "./types.js";

const GAYA =
  "Gaya bahasa: santai dan akrab seperti ngobrol dengan teman, tapi tetap akurat dan sopan. " +
  "Tidak bertele-tele. Tulis dalam bahasa Indonesia.";

const ATURAN_FAKTA =
  "Hanya pakai fakta dari bahan berita yang diberikan. Jangan menambah angka, kutipan, atau klaim baru. " +
  "Tulis ulang dengan kalimat sendiri, jangan menyalin teks media lain. " +
  "Langsung tulis hasilnya tanpa kalimat pengantar atau penutup dari kamu.";

export const prompts = {
  searchSystem:
    "Kamu Manajer Redaksi sebuah media kreatif Indonesia. Tugasmu mencari berita yang sedang hangat " +
    "dan layak diolah menjadi konten media sosial. Gunakan web search. Utamakan berita 48 jam terakhir " +
    "dari media yang kredibel. Untuk tiap berita tulis: judul, ringkasan 2-3 kalimat berisi fakta kunci, " +
    "alasan kenapa sedang hangat, tanggal terbit, dan 1-3 URL sumber yang benar-benar kamu temukan. " +
    "Jangan pernah mengarang URL atau fakta.",

  searchPrompt(topics: string[], instruction: string, today: string) {
    return [
      `Tanggal hari ini: ${today}.`,
      `Topik: ${topics.join(", ")}.`,
      instruction ? `Arahan dari pemilik: ${instruction}` : "",
      "Cari 3 sampai 5 berita hangat yang paling menarik untuk diolah jadi konten.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  extractSystem:
    "Ubah laporan riset berita menjadi data terstruktur. Salin judul, ringkasan, alasan hangat, tanggal, " +
    "dan URL persis seperti di laporan. Jangan menambah berita atau URL yang tidak ada di laporan.",

  briefSystem:
    "Kamu Manajer Redaksi. Buat brief singkat (maks 60 kata per format) untuk tim penulis: sudut pandang, " +
    "poin kunci yang wajib masuk, dan target audiens. " +
    GAYA,

  editorSystem:
    "Kamu Editor sebuah media kreatif. Cek konten terhadap bahan berita: semua fakta harus sesuai bahan, " +
    "tidak ada klaim tambahan, sumber tercantum, dan format sesuai permintaan. " +
    "Isi `lolos` dengan true bila layak terbit. Catatan maks 50 kata; bila tidak lolos sebut masalahnya secara spesifik.",

  writerSystem(format: Format) {
    return `${WRITER_ROLE[format]} ${GAYA} ${ATURAN_FAKTA}`;
  },

  bahan(c: Candidate) {
    const sumber = c.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
    return [
      `Judul: ${c.title}`,
      `Tanggal terbit: ${c.published_at}`,
      `Ringkasan: ${c.summary}`,
      `Kenapa hangat: ${c.why_hot}`,
      `Sumber:\n${sumber}`,
    ].join("\n");
  },
};

const WRITER_ROLE: Record<Format, string> = {
  artikel:
    "Kamu Penulis Artikel. Tulis artikel berita 300-500 kata: judul di baris pertama, paragraf pendek, " +
    "dan bagian 'Sumber:' berisi URL di akhir.",
  caption:
    "Kamu Copywriter Sosmed. Tulis caption Instagram/TikTok maks 120 kata: buka dengan hook, " +
    "akhiri dengan ajakan berkomentar, lalu 5-8 hashtag relevan dan baris 'Sumber: <nama media>'.",
  thread:
    "Kamu Penulis Thread. Tulis thread X/Threads 5-7 post bernomor (1/, 2/, ...), tiap post maks 280 karakter. " +
    "Post terakhir berisi sumber.",
  video:
    "Kamu Scriptwriter Video. Tulis naskah video pendek 30-60 detik dengan bagian HOOK, ISI, dan PENUTUP. " +
    "Beri arahan visual singkat di dalam [kurung siku]. Akhiri dengan baris sumber.",
};

export const schemas = {
  candidates: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            why_hot: { type: "string" },
            published_at: { type: "string" },
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: { title: { type: "string" }, url: { type: "string" } },
                required: ["title", "url"],
                additionalProperties: false,
              },
            },
          },
          required: ["title", "summary", "why_hot", "published_at", "sources"],
          additionalProperties: false,
        },
      },
    },
    required: ["candidates"],
    additionalProperties: false,
  },
  briefs: {
    type: "object",
    properties: {
      artikel: { type: "string" },
      caption: { type: "string" },
      thread: { type: "string" },
      video: { type: "string" },
    },
    required: ["artikel", "caption", "thread", "video"],
    additionalProperties: false,
  },
  review: {
    type: "object",
    properties: { lolos: { type: "boolean" }, catatan: { type: "string" } },
    required: ["lolos", "catatan"],
    additionalProperties: false,
  },
};
