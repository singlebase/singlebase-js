import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "SinglebaseAuthSDK",
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
      formats: ["es", "cjs"]
    },
    sourcemap: true,
    rollupOptions: {
      output: {
        exports: "named"
      }
    }
  }
});
