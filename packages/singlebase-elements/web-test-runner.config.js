import { esbuildPlugin } from "@web/dev-server-esbuild";

export default {
  nodeResolve: true,
  plugins: [esbuildPlugin({ ts: true, target: "es2022" })],
  files: "test/**/*.test.ts",
  // Tests run Lit's dev build on purpose (it adds checks); drop its
  // "not for production" notice, which is only noise here.
  filterBrowserLogs: ({ args }) => !args.some((arg) => String(arg).includes("lit.dev/msg/dev-mode"))
};
