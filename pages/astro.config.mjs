import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  integrations: [react(), tailwind()],
  build: {
    inlineStylesheets: "auto"
  },
  vite: {
    worker: {
      format: "es"
    },
    optimizeDeps: {
      include: ["@agentwatch/pre-share"]
    },
    ssr: {
      noExternal: ["@agentwatch/pre-share"]
    }
  }
});
