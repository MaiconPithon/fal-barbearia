import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Handle ChunkLoadError – clear cache and reload
window.addEventListener("error", (event) => {
  if (
    event.message?.includes("ChunkLoadError") ||
    event.message?.includes("Loading chunk") ||
    event.message?.includes("Failed to fetch dynamically imported module")
  ) {
    console.warn("[ChunkLoadError] Clearing cache and reloading...");
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    window.location.reload();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || "";
  if (
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Failed to fetch dynamically imported module")
  ) {
    console.warn("[ChunkLoadError] Clearing cache and reloading...");
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
