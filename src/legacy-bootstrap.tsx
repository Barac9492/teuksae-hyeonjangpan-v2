import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadAppConfig } from "./domain/config";
import { createRepository } from "./data/createRepository";
import { resolveRuntimeBackend } from "./data/runtime";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

export async function bootstrap(): Promise<void> {
  const config = await loadAppConfig();
  const runtime = resolveRuntimeBackend(
    import.meta.env as unknown as Record<string, string | boolean | undefined>,
  );
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("root 엘리먼트를 찾을 수 없습니다.");
  if (runtime.mode === "production" && runtime.error) {
    ReactDOM.createRoot(rootElement).render(
      <main className="shell app-main">
        <section className="operator-warning" role="alert">
          <h1>공유 운영을 시작할 수 없습니다</h1>
          <p>{runtime.error}</p>
        </section>
      </main>,
    );
    return;
  }
  const effectiveConfig = {
    ...config,
    demoMode: runtime.mode === "local" || runtime.mode === "pilot",
  };
  const repository = createRepository(effectiveConfig, runtime);
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App config={effectiveConfig} repository={repository} runtime={runtime} />
    </React.StrictMode>,
  );
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    const register = (): void => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }
}

