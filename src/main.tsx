import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./hooks/useAuthContext.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { retryOutbox } from "./lib/sync.ts";
import { registerServiceWorker } from "./lib/swUpdate.ts";
import "./index.css";

// Catch up on any progress pushes that failed while this device was offline
// last session — sync.ts's own online/visibility listeners cover reconnects
// within a session, but a queued write needs a chance to go out on a fresh
// load too, in case the app was closed before coming back online.
void retryOutbox();

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
