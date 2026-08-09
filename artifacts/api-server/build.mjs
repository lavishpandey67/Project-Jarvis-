import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { copyFile, rm } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  const candidates = [
    path.resolve(artifactDir, "../../node_modules/@electric-sql/pglite/dist"),
    path.resolve(artifactDir, "../../lib/db/node_modules/@electric-sql/pglite/dist"),
  ];
  let pgliteDistDir = candidates.find((c) => existsSync(path.resolve(c, "postgres.data")));

  if (!pgliteDistDir) {
    const pnpmBase = path.resolve(artifactDir, "../../node_modules/.pnpm");
    if (existsSync(pnpmBase)) {
      const entries = readdirSync(pnpmBase);
      for (const entry of entries) {
        if (entry.startsWith("@electric-sql+pglite")) {
          const p = path.resolve(pnpmBase, entry, "node_modules/@electric-sql/pglite/dist");
          if (existsSync(path.resolve(p, "postgres.data"))) {
            pgliteDistDir = p;
            break;
          }
        }
      }
    }
  }

  if (pgliteDistDir) {
    await copyFile(
      path.resolve(pgliteDistDir, "postgres.data"),
      path.resolve(distDir, "postgres.data")
    );
    await copyFile(
      path.resolve(pgliteDistDir, "postgres.wasm"),
      path.resolve(distDir, "postgres.wasm")
    );
    console.log("Copied PGlite assets to dist successfully from", pgliteDistDir);
  } else {
    console.warn("Notice: PGlite assets not found.");
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
