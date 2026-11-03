// Bundle test/*.test.ts with esbuild, then run them with Node's built-in test runner.
// (vitest/workerd are avoided on purpose: Defender ASR on dev machines blocks fresh native binaries.)
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync("test").filter((f) => f.endsWith(".test.ts"));
rmSync(".test-build", { recursive: true, force: true });
await build({
  entryPoints: files.map((f) => `test/${f}`),
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: ".test-build",
  outExtension: { ".js": ".mjs" },
  logLevel: "warning",
});
const run = spawnSync(process.execPath, ["--test", ...files.map((f) => `.test-build/${f.replace(/\.ts$/, ".mjs")}`)], {
  stdio: "inherit",
});
process.exit(run.status ?? 1);
