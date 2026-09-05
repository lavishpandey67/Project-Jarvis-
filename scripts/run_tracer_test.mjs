import { createRequire } from "node:module";
import path from "node:path";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");

async function main() {
  console.log("Bundling Tracer Bullet 01 Test Suite...");
  await build({
    entryPoints: ["artifacts/api-server/src/tests/test_tracer_bullet_01.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: "artifacts/api-server/dist/test_tracer_bullet.mjs",
  });
  console.log("Running Tracer Bullet 01 Test Suite...\n");
  execSync("node artifacts/api-server/dist/test_tracer_bullet.mjs", {
    stdio: "inherit",
    env: process.env,
  });
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

