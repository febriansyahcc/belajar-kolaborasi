# Kantor Redaksi AI 3D

Kantor 3D isometrik berisi enam karyawan AI yang mengubah berita hangat menjadi artikel, caption Instagram/TikTok, thread X/Threads, dan naskah video pendek. Anda memberi tugas ke Manajer Redaksi, Manajer mencari berita lewat web search, Anda memilih satu berita, lalu tim menulis dan Editor mengecek hasilnya terhadap sumber.

## Menjalankan

Butuh Node.js 22.13 atau lebih baru.

```bash
npm install
cp server/.env.example server/.env   # lalu isi GEMINI_API_KEY atau ANTHROPIC_API_KEY
npm run dev
```

Buka http://localhost:5173.

Tanpa API key, server berjalan dalam **mode simulasi**: alur dan animasi bisa dicoba, tapi isi berita dan konten hanya contoh dan tidak ada biaya API.

## Penyedia AI

Server memilih penyedia dari `server/.env`: `PROVIDER=gemini`, `claude`, atau `simulasi`. Bila `PROVIDER` kosong, dipilih otomatis dari API key yang terisi (Gemini didahulukan).

| Karyawan | Tugas | Gemini (default) | Claude (default) |
| --- | --- | --- | --- |
| Manajer Redaksi | Cari berita di web, susun brief | `gemini-3.8-flash` + Google Search grounding | `claude-sonnet-5-5` + web search |
| 4 penulis | Tulis konten | `gemini-3.8-flash` | `claude-haiku-5-5` |
| Editor | Cek fakta terhadap bahan berita | `gemini-3.8-flash` | `claude-sonnet-5-5` |
| (ekstraksi data) | Ubah hasil riset jadi daftar kandidat | `gemini-3.8-flash` | `claude-haiku-5-5` |

Semua model bisa diganti per peran lewat `.env`. API key Gemini dibuat di [Google AI Studio](https://aistudio.google.com/apikey). Kuota dan tarif Gemini (termasuk Google Search grounding) mengikuti ketentuan Google untuk akun Anda.

Untuk Claude Sonnet/Opus, fallback sisi server (`fallbacks: "default"`) aktif: bila permintaan ditolak filter keamanan, API mencoba ulang dengan model cadangan.

## Biaya

- Pencarian hanya jalan saat tombol ditekan. Untuk Claude, batas pencarian web per permintaan diatur di `MAX_WEB_SEARCH`.
- Pemakaian token tiap panggilan tercatat di tab Log dan tabel `events`.

## Struktur

```
server/   Backend Node.js + TypeScript (Express, SSE)
  src/brain.ts      Tugas tiap karyawan, sama untuk semua penyedia
  src/gemini.ts     Penyedia Gemini (@google/genai)
  src/claude.ts     Penyedia Claude (@anthropic-ai/sdk)
  src/pipeline.ts   Alur kerja: cari → pilih → brief → tulis → cek → revisi
  src/db.ts         SQLite (node:sqlite), file di data/redaksi.db
web/      Frontend Vite + React + React Three Fiber
  src/office/       Kantor 3D, karakter, label
  src/panel/        Panel Tugas, Hasil, Log
```

API key hanya dibaca server dari `server/.env` dan tidak pernah dikirim ke browser. File `.env` dan database tidak ikut di-commit.
