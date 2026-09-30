import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // /map-data is the GIS page's offline street map and boundaries (served by the API).
  server: {
    proxy: { "/api": "http://localhost:3001", "/map-data": "http://localhost:3001" },
  },
  preview: {
    allowedHosts: true,
    proxy: { "/api": "http://localhost:3001", "/map-data": "http://localhost:3001" },
  },
});
