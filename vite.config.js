import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

const apiTarget = "http://127.0.0.1:4174";

export default defineConfig({
  base: "./",
  plugins: [react(), cloudflare()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/data": apiTarget,
      "/local-asset": apiTarget,
    },
  },
  build: {
    outDir: "dist/app",
    emptyOutDir: true,
  },
});