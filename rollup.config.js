/**
 * Rollup config
 *
 * This script config allows us to create a bundle of the library
 * the library is meant to be used at ES module, or <script type="module" src"">
 *
 * intall:
 * > npm install -g rollup
 *
 * run
 * > rollup -c
 */

import banner from 'rollup-plugin-banner';
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";
import babel from "@rollup/plugin-babel";
import typescript from "rollup-plugin-typescript";

import pkg from "./package.json";

const topBanner = `${pkg.pkgName} ${pkg.version}
${pkg.homepage}
`;

// export default {
//   input: './src/index.js',
//   output: {
//     file: './dist/singlebase.esm.js',
//     format: 'esm',
//   },
//   plugins: [terser.terser(), banner(topBanner)],
// };


const input = ["src/index.ts"];
export  default [
  {
    // UMD
    input,
    plugins: [
      typescript(),
      nodeResolve(),
      babel({
        babelHelpers: "bundled",
      }),
      terser(),
      banner(topBanner)
    ],
    output: {
      dir: "./dist/umd",
      format: "umd",
      name: "myLibrary", // this is the name of the global object
      esModule: false,
      exports: "named",
      sourcemap: true,
    },
  },
  // ESM and CJS
  {
    input,
    plugins: [typescript(), nodeResolve(), terser(), banner(topBanner)],
    output: [
      {
        dir: "./dist/esm",
        format: "esm",
        exports: "named",
        sourcemap: true,
      },
      {
        dir: "./dist/cjs",
        format: "cjs",
        exports: "named",
        sourcemap: true,
      },
    ],
  },
];