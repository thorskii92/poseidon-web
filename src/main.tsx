import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./AuthContext";
import { ApiError } from "./api";
import App from "./App.tsx";
import "./index.css";
// Every report and printout uses it, and several never import it themselves —
// load it with the app, not with whichever page happened to load first.
import "./print.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying an expired session just delays the login screen.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
