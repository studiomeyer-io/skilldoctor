import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
  version: string;
};

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  // Inline the package version at build time so the CLI reports it without
  // reading package.json at runtime (which differs between ESM and CJS).
  define: {
    __SKILLDOCTOR_VERSION__: JSON.stringify(pkg.version),
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  minify: false,
  target: "node20",
  platform: "node",
  // Emit distinct extensions: .js for ESM, .cjs for CJS, plus matching
  // .d.ts / .d.cts declaration files. This pairs with the condition-split
  // "exports" map in package.json so are-the-types-wrong is fully green.
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
  // cjsInterop normalizes a single default export so `require("skilldoctor")`
  // and the generated .d.cts agree on the CJS shape (no "false ESM" / module
  // resolution mismatches under attw's node10/node16 probes).
  cjsInterop: true,
});
