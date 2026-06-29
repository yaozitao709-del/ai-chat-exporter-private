import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    charset: "ascii"
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/background/index.ts"),
      output: {
        format: "iife",
        name: "AIChatExporterBackground",
        entryFileNames: "assets/background.js",
        inlineDynamicImports: true
      }
    }
  }
});
