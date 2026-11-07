import { DESKS, ROOMS, WALL_H, backWallHeight, roomById, type Desk, type Room } from "../layout";

const WALL_T = 0.12;
const WALL = "#f4f1ea";

function Box({
  pos,
  size,
  color,
  opacity,
}: {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  opacity?: number;
}) {
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent={opacity !== undefined} opacity={opacity ?? 1} />
    </mesh>
  );
}

function RoomShell({ room }: { room: Room }) {
  const { x, z, w, d } = room;
  const back = room.openSide === "front" ? z - d / 2 : z + d / 2;
  const wallColor = room.glass ? "#9cc3e6" : WALL;
  const opacity = room.glass ? 0.45 : undefined;
  const backH = backWallHeight(room);
  return (
    <group>
      <Box pos={[x, 0.01, z]} size={[w, 0.02, d]} color={room.floor} />
      {/* Dinding yang menghadap kamera dibuat pendek supaya isi ruangan tetap terlihat. */}
      <Box pos={[x, backH / 2, back]} size={[w, backH, WALL_T]} color={wallColor} opacity={opacity} />
      <Box pos={[x - w / 2, WALL_H / 2, z]} size={[WALL_T, WALL_H, d]} color={wallColor} opacity={opacity} />
      <Box pos={[x + w / 2, WALL_H / 2, z]} size={[WALL_T, WALL_H, d]} color={wallColor} opacity={opacity} />
    </group>
  );
}

function WorkDesk({ desk, color = "#c8a77e" }: { desk: Desk; color?: string }) {
  const chairZ = desk.z + desk.facing * 0.85;
  const monitorZ = desk.z - desk.facing * 0.2;
  return (
    <group>
      <Box pos={[desk.x, 0.38, desk.z]} size={[1.6, 0.76, 0.8]} color={color} />
      <Box pos={[desk.x, 0.98, monitorZ]} size={[0.75, 0.45, 0.06]} color="#2d3142" />
      <Box pos={[desk.x, 0.98, monitorZ + desk.facing * 0.035]} size={[0.66, 0.36, 0.01]} color="#7fb2e5" />
      <Box pos={[desk.x, 0.25, chairZ]} size={[0.55, 0.5, 0.55]} color="#4a4e69" />
    </group>
  );
}

function Plant({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.2, 0.16, 0.4, 8]} />
        <meshStandardMaterial color="#b5651d" />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <icosahedronGeometry args={[0.38, 0]} />
        <meshStandardMaterial color="#5a9e4b" flatShading />
      </mesh>
    </group>
  );
}

function Lounge() {
  const r = roomById("lounge");
  return (
    <group>
      <Box pos={[r.x, 0.25, r.z - 1.6]} size={[3.4, 0.5, 0.9]} color="#e07a5f" />
      <Box pos={[r.x, 0.6, r.z - 2.0]} size={[3.4, 0.6, 0.2]} color="#c8664d" />
      <Box pos={[r.x, 0.2, r.z + 0.1]} size={[1.4, 0.4, 0.8]} color="#d9c4a1" />
      <Box pos={[r.x + 2.4, 0.5, r.z - 1.8]} size={[0.9, 1.0, 0.6]} color="#3d405b" />
      <Plant x={r.x - 2.6} z={r.z - 1.8} />
    </group>
  );
}

function Studio() {
  const r = roomById("video");
  return (
    <group position={[r.x + 1.6, 0, r.z + 0.3]}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.2, 6]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <Box pos={[0, 1.25, 0]} size={[0.35, 0.25, 0.25]} color="#222" />
      <mesh position={[0.9, 1.4, 0.9]}>
        <sphereGeometry args={[0.18, 8, 6]} />
        <meshStandardMaterial color="#fff6cc" emissive="#ffe28a" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

export function Office() {
  return (
    <group>
      {/* Lantai dasar dan koridor */}
      <Box pos={[0, -0.05, 0]} size={[30, 0.1, 15]} color="#e9e4da" />
      <Box pos={[0, 0.005, 0]} size={[28.5, 0.01, 3.6]} color="#dcd3c4" />

      {ROOMS.map((r) => (
        <RoomShell key={r.id} room={r} />
      ))}

      <WorkDesk desk={DESKS.pemilik} color="#8d6e4f" />
      <WorkDesk desk={DESKS.manajer} />
      <WorkDesk desk={DESKS.riset} color="#a7c49a" />
      <WorkDesk desk={DESKS.artikel} />
      <WorkDesk desk={DESKS.caption} />
      <WorkDesk desk={DESKS.thread} />
      <WorkDesk desk={DESKS.video} />
      <WorkDesk desk={DESKS.editor} />

      <Lounge />
      <Studio />
      <Plant x={roomById("pemilik").x - 2.6} z={roomById("pemilik").z - 1.8} />
      <Plant x={roomById("editor").x + 2.6} z={roomById("editor").z + 1.8} />
      <Plant x={roomById("artikel").x - 2.6} z={roomById("artikel").z + 1.8} />
    </group>
  );
}
