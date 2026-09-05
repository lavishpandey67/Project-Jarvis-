import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { execSync } from "node:child_process";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const testTarget = process.argv[2] || "loop";
  const entryFile =
    testTarget === "01"
      ? "src/tests/test_tracer_bullet_01.ts"
      : testTarget === "02"
      ? "src/tests/test_tracer_bullet_02.ts"
      : testTarget === "recovery"
      ? "src/tests/test_transactional_recovery.ts"
      : "src/tests/test_autonomous_loop.ts";

  console.log(`Bundling Test Suite ${testTarget} (${entryFile})...`);
  await esbuild({
    entryPoints: [path.resolve(artifactDir, entryFile)],
    bundle: true,
    platform: "node",
    format: "esm",
    banner: {
      js: `import { createRequire } from "module"; const require = createRequire(import.meta.url);`,
    },
    outfile: path.resolve(artifactDir, "dist/test_tracer_bullet.mjs"),
    logLevel: "error",
  });
  console.log(`Running Tracer Bullet ${testTarget} Test Suite...\n`);
  execSync(`node "${path.resolve(artifactDir, "dist/test_tracer_bullet.mjs")}"`, {
    stdio: "inherit",
    env: process.env,
  });
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
