import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Tanpa StrictMode: mount ganda di mode dev membuat label <Html> dari drei bisa hilang.
createRoot(document.getElementById("root")!).render(<App />);
