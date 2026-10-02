import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./hooks/useAuthContext.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { retryOutbox } from "./lib/sync.ts";
import { registerServiceWorker } from "./lib/swUpdate.ts";
import { migrateIdbToCacheStore } from "./lib/migrateIdb.ts";
import "./index.css";

// Catch up on any progress pushes that failed while this device was offline
// last session — sync.ts's own reconnect/visibility listeners cover
// reconnects within a session, but a queued write needs a chance to go out
// on a fresh load too, in case the app was closed before coming back online.
retryOutbox().catch((e) => console.error("[sync] boot retry failed", e));

registerServiceWorker();

// One-off copy of anything still in the old IndexedDB store into the Cache
// API store, deferred past first paint so it never competes with the shell
// render or the Archive's first read. Idempotent and best-effort: a launch
// where it can't complete simply retries next time.
setTimeout(() => void migrateIdbToCacheStore(), 1500);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
