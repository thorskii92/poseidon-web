import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Pages load on demand (App.tsx), so the only big chunk left is the map
    // library (~1 MB), fetched only when a map is shown — it can't be split.
    chunkSizeWarningLimit: 1200,
  },
  // /map-data is the GIS page's offline street map and boundaries (served by the API).
  server: {
    proxy: { "/api": "http://localhost:3001", "/map-data": "http://localhost:3001" },
  },
  preview: {
    allowedHosts: true,
    proxy: { "/api": "http://localhost:3001", "/map-data": "http://localhost:3001" },
  },
});
