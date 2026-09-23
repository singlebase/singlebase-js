import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * npm build: workspace and framework dependencies stay external so a consumer
 * resolves exactly one copy of each. The self-contained bundle for <script>
 * tags is built separately — see vite.standalone.config.ts in packages/singlebase-elements.
 */
export default defineConfig({
  // Standard (TC39) decorators + auto-accessor class fields are very new
  // syntax; force esbuild to lower them to plain ES2022 rather than pass
  // them through untransformed for Rollup's parser to choke on.
  esbuild: { target: "es2022" },
  build: {
    lib: {
      // One entry per family, so a bundler can take just the uploader or just
      // the auth elements. Shared code lands in common chunks.
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        authui: resolve(__dirname, "src/authui.ts"),
        uploader: resolve(__dirname, "src/uploader.ts")
      },
      fileName: (format, name) => `${name}.${format === "es" ? "js" : "cjs"}`,
      formats: ["es", "cjs"]
    },
    sourcemap: true,
    rollupOptions: {
      external: [
        "@singlebase/core",
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
