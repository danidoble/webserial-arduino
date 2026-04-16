import { defineConfig } from "tsdown";

export default defineConfig({
  format: ["esm", "cjs"],
  external: ["webserial-core"],
  dts: {
    tsgo: true,
  },
  exports: true,
  minify: true,
  clean: true,
  // sourcemap: true, // just for dev
});
