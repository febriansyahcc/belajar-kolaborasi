import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { AGENT_INFO, ROOMS, STATUS_LABEL, roomLabelPos } from "../layout";
import { useStore } from "../store";

/**
 * Label HTML di atas kanvas 3D. Posisi dunia tiap label disimpan di `anchors`,
 * lalu <LabelProjector> (di dalam Canvas) memindahkan elemen DOM-nya setiap frame.
 */
export const anchors = new Map<string, Vector3>(ROOMS.map((r) => [`room:${r.id}`, roomLabelPos(r)]));
const elements = new Map<string, HTMLElement>();

const register = (key: string) => (el: HTMLElement | null) => {
  if (el) elements.set(key, el);
  else elements.delete(key);
};

const v = new Vector3();

export function LabelProjector() {
  useFrame(({ camera, size }) => {
    for (const [key, el] of elements) {
      const p = anchors.get(key);
      if (!p) continue;
      v.copy(p).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

export function LabelOverlay() {
  const agents = useStore((s) => s.agents);
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);

  return (
    <div className="label-layer" aria-hidden>
      {ROOMS.map((r) => (
        <div key={r.id} ref={register(`room:${r.id}`)} className="label room-label">
          {r.name}
        </div>
      ))}
      {Object.values(agents).map((a) => {
        const working = a.status !== "santai";
        const isSel = selected === a.id;
        // Nama hanya muncul saat bekerja, dipilih, atau disorot, supaya Lounge tidak penuh label.
        const showName = working || isSel || hovered === a.id;
        return (
          <div key={a.id} ref={register(`agent:${a.id}`)} className={`label agent-tag ${isSel ? "is-selected" : ""}`}>
            {working && <div className={`bubble status-${a.status}`}>{STATUS_LABEL[a.status]}</div>}
            {showName && <div className="name">{AGENT_INFO[a.id].name}</div>}
          </div>
        );
      })}
    </div>
  );
}
