import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3, type Group } from "three";
import { AGENT_INFO, CORRIDOR_Z, targetFor } from "../layout";
import { anchors } from "./labels";
import { useStore } from "../store";
import type { AgentId, AgentState } from "../types";

const SPEED = 5;
const SKIN = "#f1c7a3";

/** Rute lewat koridor: keluar ruangan, jalan di koridor, masuk ruangan tujuan. */
function routeTo(from: [number, number], to: [number, number]): [number, number][] {
  const sameRow = Math.sign(from[1] - CORRIDOR_Z) === Math.sign(to[1] - CORRIDOR_Z);
  if (sameRow && Math.abs(from[0] - to[0]) < 3) return [to];
  return [[from[0], CORRIDOR_Z], [to[0], CORRIDOR_Z], to];
}

export function Agent({ id, state }: { id: AgentId; state: AgentState }) {
  const info = AGENT_INFO[id];
  const selected = useStore((s) => s.selected === id);
  const select = useStore((s) => s.select);
  const hover = useStore((s) => s.hover);
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);

  const { pos: target, seated } = targetFor(id, state.status);
  const path = useRef<[number, number][]>([]);
  const current = useRef<[number, number]>(target);
  const walking = useRef(false);

  useEffect(() => {
    path.current = routeTo(current.current, target);
  }, [target[0], target[1]]);

  useFrame((frame, dt) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    const next = path.current[0];
    const t = frame.clock.elapsedTime;

    if (next) {
      const [cx, cz] = current.current;
      const dx = next[0] - cx;
      const dz = next[1] - cz;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist, SPEED * Math.min(dt, 0.05));
      if (dist < 0.01) {
        path.current.shift();
      } else {
        current.current = [cx + (dx / dist) * step, cz + (dz / dist) * step];
        g.rotation.y = Math.atan2(dx, dz);
      }
      walking.current = true;
    } else if (walking.current) {
      walking.current = false;
      // Sampai: hadapkan ke meja (meja ada di arah dinding belakang ruangan).
      g.rotation.y = seated ? (target[1] < CORRIDOR_Z ? Math.PI : 0) : Math.PI;
    }

    g.position.set(current.current[0], 0, current.current[1]);
    const anchor = anchors.get(`agent:${id}`) ?? new Vector3();
    anchors.set(`agent:${id}`, anchor.set(current.current[0], 2.05, current.current[1]));
    const busy = state.status === "menulis" || state.status === "mencari" || state.status === "mengecek";
    if (walking.current) b.position.y = Math.abs(Math.sin(t * 10)) * 0.08;
    else if (busy) b.position.y = Math.abs(Math.sin(t * 14)) * 0.025;
    else b.position.y = Math.sin(t * 2 + id.length) * 0.01;
  });


  return (
    <group
      ref={group}
      position={[target[0], 0, target[1]]}
      onClick={(e) => {
        e.stopPropagation();
        select(id);
      }}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
        hover(id);
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
        hover(null);
      }}
    >
      <group ref={body}>
        {/* Kaki, badan, kepala, rambut */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.36, 0.6, 0.26]} />
          <meshStandardMaterial color="#3d405b" />
        </mesh>
        <mesh position={[0, 0.86, 0]}>
          <boxGeometry args={[0.5, 0.56, 0.32]} />
          <meshStandardMaterial color={info.color} />
        </mesh>
        <mesh position={[0, 1.36, 0]}>
          <boxGeometry args={[0.38, 0.38, 0.36]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        <mesh position={[0, 1.58, -0.02]}>
          <boxGeometry args={[0.4, 0.1, 0.4]} />
          <meshStandardMaterial color={info.hair} />
        </mesh>
        {selected && (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.45, 0.58, 24]} />
            <meshBasicMaterial color="#ffd166" />
          </mesh>
        )}
      </group>
    </group>
  );
}
