import { Vector3 } from "three";
import type { AgentId, AgentStatus } from "./types";

/** Denah kantor dalam satuan dunia 3D. x ke kanan, z ke depan (mendekati kamera). */
export interface Room {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  floor: string;
  glass?: boolean;
  /** Sisi ruangan yang terbuka ke koridor. */
  openSide: "front" | "back";
}

const ROW_BACK = -4.5;
const ROW_FRONT = 4.5;
const COLS = [-10.5, -3.5, 3.5, 10.5];
const W = 6.4;
const D = 5;

export const CORRIDOR_Z = 0;

export const ROOMS: Room[] = [
  { id: "pemilik", name: "Ruang Pemilik", x: COLS[0], z: ROW_BACK, w: W, d: D, floor: "#f3e3c3", openSide: "front" },
  { id: "manajer", name: "Ruang Manajer", x: COLS[1], z: ROW_BACK, w: W, d: D, floor: "#dce9f5", glass: true, openSide: "front" },
  { id: "riset", name: "Meja Riset", x: COLS[2], z: ROW_BACK, w: W, d: D, floor: "#e3f0dc", openSide: "front" },
  { id: "lounge", name: "Lounge", x: COLS[3], z: ROW_BACK, w: W, d: D, floor: "#f6dde0", openSide: "front" },
  { id: "artikel", name: "Desk Artikel", x: COLS[0], z: ROW_FRONT, w: W, d: D, floor: "#e6e0f5", openSide: "back" },
  { id: "sosmed", name: "Desk Sosmed", x: COLS[1], z: ROW_FRONT, w: W, d: D, floor: "#fbe8d4", openSide: "back" },
  { id: "video", name: "Studio Video", x: COLS[2], z: ROW_FRONT, w: W, d: D, floor: "#d9eeee", openSide: "back" },
  { id: "editor", name: "Meja Editor", x: COLS[3], z: ROW_FRONT, w: W, d: D, floor: "#eef0d6", openSide: "back" },
];

export const WALL_H = 1.1;

/** Dinding yang menghadap kamera dibuat pendek supaya isi ruangan tetap terlihat. */
export const backWallHeight = (r: Room) => (r.openSide === "back" ? 0.3 : WALL_H);

export const roomLabelPos = (r: Room) =>
  new Vector3(r.x, backWallHeight(r) + 0.35, r.openSide === "front" ? r.z - r.d / 2 : r.z + r.d / 2);

export const roomById = (id: string) => ROOMS.find((r) => r.id === id)!;

/** Meja kerja: posisi meja dan arah duduk (karakter menghadap ke dinding belakang ruangan). */
export interface Desk {
  x: number;
  z: number;
  /** +1 bila karakter duduk di sisi z lebih besar dari meja. */
  facing: 1 | -1;
}

const desk = (roomId: string, dx = 0): Desk => {
  const r = roomById(roomId);
  // Meja dekat dinding belakang, karakter duduk di sisi yang menghadap koridor.
  return r.openSide === "front" ? { x: r.x + dx, z: r.z - 0.6, facing: 1 } : { x: r.x + dx, z: r.z + 0.6, facing: -1 };
};

export const DESKS = {
  pemilik: desk("pemilik"),
  manajer: desk("manajer"),
  riset: desk("riset"),
  artikel: desk("artikel"),
  caption: desk("sosmed", -1.4),
  thread: desk("sosmed", 1.4),
  video: desk("video", -1),
  editor: desk("editor"),
};

export const seatOf = (d: Desk): [number, number] => [d.x, d.z + d.facing * 0.85];

const lounge = roomById("lounge");
const LOUNGE_SPOTS: Record<AgentId, [number, number]> = {
  manajer: [lounge.x - 2.2, lounge.z + 1.2],
  artikel: [lounge.x - 0.9, lounge.z + 1.6],
  caption: [lounge.x + 0.4, lounge.z + 1.6],
  thread: [lounge.x + 1.7, lounge.z + 1.3],
  video: [lounge.x + 2.3, lounge.z - 0.2],
  editor: [lounge.x - 2.3, lounge.z - 0.3],
};

const HOME_DESK: Record<AgentId, Desk> = {
  manajer: DESKS.manajer,
  artikel: DESKS.artikel,
  caption: DESKS.caption,
  thread: DESKS.thread,
  video: DESKS.video,
  editor: DESKS.editor,
};

/** Ke mana karakter pergi untuk status tertentu. */
export function targetFor(id: AgentId, status: AgentStatus): { pos: [number, number]; seated: boolean } {
  if (status === "santai") return { pos: LOUNGE_SPOTS[id], seated: false };
  if (id === "manajer" && status === "mencari") return { pos: seatOf(DESKS.riset), seated: true };
  return { pos: seatOf(HOME_DESK[id]), seated: true };
}

export const AGENT_INFO: Record<AgentId, { name: string; role: string; color: string; hair: string }> = {
  manajer: { name: "Manajer Redaksi", role: "Cari berita, pilih sudut, bagi tugas", color: "#3b6fd8", hair: "#2b2118" },
  artikel: { name: "Penulis Artikel", role: "Artikel 300-500 kata", color: "#8a5cd6", hair: "#4a2f1d" },
  caption: { name: "Copywriter Sosmed", role: "Caption IG/TikTok + hashtag", color: "#e0833a", hair: "#1d1d1d" },
  thread: { name: "Penulis Thread", role: "Thread X/Threads", color: "#d6487a", hair: "#6b3b1f" },
  video: { name: "Scriptwriter Video", role: "Naskah video 30-60 detik", color: "#2a9d8f", hair: "#2b2118" },
  editor: { name: "Editor", role: "Cek fakta terhadap sumber", color: "#5f7d2e", hair: "#8c8c8c" },
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  santai: "Santai",
  mencari: "🔍 Mencari",
  menulis: "✍️ Menulis",
  mengecek: "✅ Mengecek",
  menunggu: "❗ Menunggu",
  gagal: "⚠️ Gagal",
};

export interface CameraFocus {
  label: string;
  x: number;
  z: number;
  zoom: number;
}

export const FOCUS_OPTIONS: CameraFocus[] = [
  { label: "Seluruh kantor", x: 0, z: 0, zoom: 1 },
  ...ROOMS.map((r) => ({ label: r.name, x: r.x, z: r.z, zoom: 2.6 })),
];
