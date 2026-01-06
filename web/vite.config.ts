import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Build target: "default" (full), "watcher", or "analyzer"
const target = process.env.BUILD_TARGET || "default";

// Port configuration per target
const ports: Record<string, number> = {
  default: 8420,
  watcher: 8420,
  analyzer: 8421
};

const apiPort = ports[target] || 8420;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: target === "default" ? "dist" : `dist/${target}`,
    rollupOptions: {
      input:
        target === "default"
          ? undefined
          : `src/apps/${target}/main.tsx`
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true
      },
      "/ws": {
        target: `http://localhost:${apiPort}`,
        ws: true,
        changeOrigin: true
      }
    }
  }
});
