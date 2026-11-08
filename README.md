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

## Membuka dari HP

Jalankan di laptop, lalu buka dari HP yang tersambung ke Wi-Fi yang sama:

```bash
npm run dev:hp
```

Terminal akan menampilkan alamat `Network: http://192.168.x.x:5173/`. Buka alamat itu di browser HP. Laptop harus tetap menyala dan terhubung ke Wi-Fi. Di Windows, izinkan Node.js saat Windows Firewall bertanya (pilih jaringan Private).

Aplikasi ini tidak punya login, jadi siapa pun di Wi-Fi yang sama bisa membukanya dan memakai kuota API Anda. Pakai hanya di jaringan rumah yang Anda percaya.

## Penyedia AI

Server memilih penyedia dari `server/.env`: `PROVIDER=gemini`, `claude`, atau `simulasi`. Bila `PROVIDER` kosong, dipilih otomatis dari API key yang terisi (Gemini didahulukan).

| Karyawan | Tugas | Gemini (default) | Claude (default) |
| --- | --- | --- | --- |
| Manajer Redaksi | Cari berita, susun brief | `gemini-3.8-flash` + judul Google News RSS | `claude-sonnet-5-5` + web search |
| 4 penulis | Tulis konten | `gemini-3.8-flash` | `claude-haiku-5-5` |
| Editor | Cek fakta terhadap bahan berita | `gemini-3.8-flash` | `claude-sonnet-5-5` |
| (ekstraksi data) | Ubah hasil riset jadi daftar kandidat | `gemini-3.8-flash` | `claude-haiku-5-5` |

Semua model bisa diganti per peran lewat `.env`. API key Gemini dibuat di [Google AI Studio](https://aistudio.google.com/apikey).

**Pencarian berita di Gemini.** Menurut [halaman harga Gemini API](https://ai.google.dev/gemini-api/docs/pricing), Grounding with Google Search berstatus "Not available" di Free Tier untuk `gemini-3.8-flash` dan model Gemini 3 lainnya. Karena itu Manajer Gemini secara default (`GEMINI_SEARCH=rss`) mengambil judul berita terbaru dari RSS Google News, lalu memilih dan meringkasnya. Model hanya menyebut nomor judul; URL sumber diambil langsung dari RSS. Ringkasan hanya berdasar judul, jadi isinya lebih tipis daripada hasil pencarian web penuh. Di paket berbayar, pakai `GEMINI_SEARCH=google`.

Paket gratis Gemini: data dipakai Google untuk meningkatkan produknya ("Used to improve our products: Yes" di halaman harga), dan sebagian project perlu [verifikasi perangkat](https://ai.google.dev/gemini-api/docs/verification).

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
