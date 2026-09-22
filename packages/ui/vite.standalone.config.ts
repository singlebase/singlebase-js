import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * The drop-in build for a plain `<script type="module">` tag: everything —
 * Lit, core, auth and the service SDK — inlined into one minified file with
 * no bare imports to resolve, so it works from a CDN with no bundler and no
 * import map.
 *
 * Because this file carries its own copy of the modules, two different
 * Singlebase bundles on one page would otherwise each hold a private client.
 * That is exactly what core's globalThis/Symbol.for registry exists for:
 * widgets from separate bundles still find the same session.
 */
export default defineConfig({
  esbuild: { target: "es2022" },
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/standalone.ts"),
      fileName: () => "singlebase-authui.min.js",
      formats: ["es"]
    },
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      external: []
    }
  }
});
