import { useEffect } from "react";
import { FOCUS_OPTIONS } from "./layout";
import { Scene } from "./office/Scene";
import { Panel } from "./panel/Panel";
import { connectEvents, loadState, useStore } from "./store";

function FocusSwitcher() {
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const i = FOCUS_OPTIONS.indexOf(focus);
  const go = (step: number) => setFocus(FOCUS_OPTIONS[(i + step + FOCUS_OPTIONS.length) % FOCUS_OPTIONS.length]);
  return (
    <div className="focus-switcher">
      <button onClick={() => go(-1)} aria-label="Ruangan sebelumnya">‹</button>
      <span>{focus.label}</span>
      <button onClick={() => go(1)} aria-label="Ruangan berikutnya">›</button>
    </div>
  );
}

export function App() {
  useEffect(() => {
    void loadState().catch(() => undefined);
    return connectEvents();
  }, []);

  return (
    <div className="app">
      <main className="stage">
        <Scene />
        <FocusSwitcher />
        <p className="hint">Seret untuk memutar · scroll untuk zoom · klik karakter untuk lihat kerjaannya</p>
      </main>
      <Panel />
    </div>
  );
}
