import { esbuildPlugin } from "@web/dev-server-esbuild";

export default {
  nodeResolve: true,
  plugins: [esbuildPlugin({ ts: true, target: "es2022" })],
  files: "test/**/*.test.ts"
};
