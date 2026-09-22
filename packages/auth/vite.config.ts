import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * npm build: workspace and framework dependencies stay external so a consumer
 * resolves exactly one copy of each. The self-contained bundle for <script>
 * tags is built separately — see vite.standalone.config.ts in packages/ui.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "SinglebaseAuth",
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
      formats: ["es", "cjs"]
    },
    sourcemap: true,
    rollupOptions: {
      external: [
        "@singlebase/core"
      ],
      output: {
        exports: "named"
      }
    }
  }
});
