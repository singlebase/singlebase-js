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


import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from '@rollup/plugin-replace';
import { terser } from "rollup-plugin-terser";
import babel from "@rollup/plugin-babel";
import typescript from "rollup-plugin-typescript";

import pkg from "./package.json";

const banner = `
/**
 * ==
 * Singlebase.cloud
 * A backend-as-a-service (BaaS), featuring:
 * - LLM & AI functionalities
 * - VectorDB: Vector Database for AI and LLM apps
 * - Datastore: NoSQL Document Database
 * - Authentication: For authentication
 * - Filestore: For file storage
 * - Search: For text search and vector search
 * - Images: Image service to manipulate image
 * 
 * Website: ${pkg.homepage}
 * ==
 * Pkg: ${pkg.pkgName}@${pkg.version}
 * Description: ${pkg.description}
 * Doc: ${pkg.documentationURL}
 * ==
 */
`;

const input = ["src/index.ts"];

export  default [
  {
    // UMD
    input,
    plugins: [
      typescript(),
      nodeResolve(),
      babel({ babelHelpers: "bundled" }),
      terser({
        format: {
          preamble: banner
        }
      }),
      replace({
        preventAssignment: true,
        values: {
          '__VERSION__': pkg.version
        }
      })
    ],
    output: {
      dir: "./dist/umd",
      format: "umd",
      name: "SinglebaseClient", // this is the name of the global object
      esModule: false,
      exports: "named",
      sourcemap: true,
    },
  },
  // ESM and CJS
  {
    input,
    plugins: [
      typescript(), 
      nodeResolve(), 
      terser({
        format: {
          preamble: banner
        }
      }),
      replace({
        preventAssignment: true,
        values: {
          '__VERSION__': pkg.version
        }
      })
    ],
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