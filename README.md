# Kantor Redaksi AI 3D

Kantor 3D isometrik berisi enam karyawan AI yang mengubah berita hangat menjadi artikel, caption Instagram/TikTok, thread X/Threads, dan naskah video pendek. Anda memberi tugas ke Manajer Redaksi, Manajer mencari berita lewat web search, Anda memilih satu berita, lalu tim menulis dan Editor mengecek hasilnya terhadap sumber.

## Menjalankan

Butuh Node.js 22.13 atau lebih baru.

```bash
npm install
cp server/.env.example server/.env   # lalu isi ANTHROPIC_API_KEY
npm run dev
```

Buka http://localhost:5173.

Tanpa API key, server berjalan dalam **mode simulasi**: alur dan animasi bisa dicoba, tapi isi berita dan konten hanya contoh dan tidak ada biaya API.

## Tim dan model

| Karyawan | Tugas | Model (bisa diganti di `.env`) |
| --- | --- | --- |
| Manajer Redaksi | Cari berita (web search), susun brief | `claude-sonnet-5-5` |
| Penulis Artikel, Copywriter Sosmed, Penulis Thread, Scriptwriter Video | Tulis konten | `claude-haiku-5-5` |
| Editor | Cek fakta terhadap bahan berita | `claude-sonnet-5-5` |
| (ekstraksi data) | Ubah hasil riset jadi daftar kandidat | `claude-haiku-5-5` |

Untuk model Sonnet/Opus, fallback sisi server (`fallbacks: "default"`) aktif: bila permintaan ditolak filter keamanan, API mencoba ulang dengan model cadangan.

## Biaya

- Pencarian hanya jalan saat tombol ditekan. Batas pencarian web per permintaan diatur di `MAX_WEB_SEARCH`.
- Web search dikenai biaya per pencarian di luar biaya token.
- Pemakaian token tiap panggilan tercatat di tab Log dan tabel `events`.

## Struktur

```
server/   Backend Node.js + TypeScript (Express, SSE, Claude API)
  src/brain.ts      Prompt dan panggilan per karyawan (Claude atau simulasi)
  src/pipeline.ts   Alur kerja: cari → pilih → brief → tulis → cek → revisi
  src/db.ts         SQLite (node:sqlite), file di data/redaksi.db
web/      Frontend Vite + React + React Three Fiber
  src/office/       Kantor 3D, karakter, label
  src/panel/        Panel Tugas, Hasil, Log
```

API key hanya dibaca server dari `server/.env` dan tidak pernah dikirim ke browser. File `.env` dan database tidak ikut di-commit.
