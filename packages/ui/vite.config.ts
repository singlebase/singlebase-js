import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * npm build: workspace and framework dependencies stay external so a consumer
 * resolves exactly one copy of each. The self-contained bundle for <script>
 * tags is built separately — see vite.standalone.config.ts in packages/ui.
 */
export default defineConfig({
  // Standard (TC39) decorators + auto-accessor class fields are very new
  // syntax; force esbuild to lower them to plain ES2022 rather than pass
  // them through untransformed for Rollup's parser to choke on.
  esbuild: { target: "es2022" },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "SinglebaseAuthUI",
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
      formats: ["es", "cjs"]
    },
    sourcemap: true,
    rollupOptions: {
      external: [
        "@singlebase/core",
        "@singlebase/auth",
        "@singlebase/singlebase-sdk",
        "lit",
        /^lit\//
      ],
      output: {
        exports: "named"
      }
    }
  }
});
