import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore } from "../store";
import { Agent } from "./Agent";
import { LabelOverlay, LabelProjector } from "./labels";
import { Office } from "./Office";

const BASE_ZOOM = 34;

/** Geser kamera pelan-pelan ke ruangan yang dipilih. */
function CameraRig() {
  const focus = useStore((s) => s.focus);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const last = useRef({ focus, width });
  const animating = useRef(true);
  const goal = useRef(new Vector3());

  useFrame((_, dt) => {
    if (!controls) return;
    if (last.current.focus !== focus || last.current.width !== width) {
      last.current = { focus, width };
      animating.current = true;
    }
    // Layar sempit (HP) butuh zoom lebih kecil supaya seluruh kantor muat.
    const zoom = BASE_ZOOM * focus.zoom * Math.min(1.3, Math.max(0.35, width / 1000));
    if (!animating.current) return;
    const k = 1 - Math.exp(-dt * 5);
    goal.current.set(focus.x, 0, focus.z);
    const delta = goal.current.clone().sub(controls.target).multiplyScalar(k);
    controls.target.add(delta);
    camera.position.add(delta);
    camera.zoom += (zoom - camera.zoom) * k;
    camera.updateProjectionMatrix();
    controls.update();
    if (delta.length() < 0.001 && Math.abs(camera.zoom - zoom) < 0.05) animating.current = false;
  });
  return null;
}

export function Scene() {
  const agents = useStore((s) => s.agents);
  const select = useStore((s) => s.select);
  return (
    <>
      <Canvas dpr={[1, 2]} onPointerMissed={() => select(null)}>
        <color attach="background" args={["#f7f4ee"]} />
        <OrthographicCamera makeDefault position={[18, 20, 22]} zoom={BASE_ZOOM} near={-100} far={200} />
        <OrbitControls makeDefault enableDamping minZoom={12} maxZoom={120} minPolarAngle={0.35} maxPolarAngle={1.2} />
        <CameraRig />
        <ambientLight intensity={1.6} />
        <directionalLight position={[10, 18, 8]} intensity={1.8} />
        <hemisphereLight args={["#ffffff", "#d8cfc0", 0.6]} />
        <Office />
        {Object.values(agents).map((a) => (
          <Agent key={a.id} id={a.id} state={a} />
        ))}
        <LabelProjector />
      </Canvas>
      <LabelOverlay />
    </>
  );
}
