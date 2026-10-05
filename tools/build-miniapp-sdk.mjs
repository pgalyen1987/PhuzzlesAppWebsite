// Builds mini/sdk.js, the Farcaster Mini App SDK as one small file the mini app serves itself.
//
// Why not the CDN line in Farcaster's docs (esm.sh)? Measured 2026-10-05: it is 124 modules and 1.08 MB, six
// imports deep, because the SDK's root pulls in zod's locales, Solana's web3.js and bn.js for wallet features
// Phuzzles never calls. The splash screen stays up until that has loaded. The build below keeps what the page
// uses (ready, context, back, quickAuth, composeCast, openUrl, haptics), replaces the two wallet
// providers with stubs, and comes out near 21 KB (7 KB gzipped).
//
// Run it from a scratch folder that has the two packages, then commit the output:
//   cd "$(mktemp -d)" && npm i @farcaster/miniapp-sdk@0.3.0 esbuild@0.25 && node ~/PhuzzlesAppWebsite/tools/build-miniapp-sdk.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.cwd(), "x.js"));
const esbuild = require("esbuild");
const version = require("@farcaster/miniapp-sdk/package.json").version;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "mini", "sdk.js");

const stubs = {
  "./ethereumProvider.js": "export const ethereumProvider = undefined; export async function getEthereumProvider() { return undefined; }",
  "./solanaProvider.js": "export async function getSolanaProvider() { return undefined; }",
};
const lean = {
  name: "lean",
  setup(b) {
    b.onResolve({ filter: /^\.\/(ethereumProvider|solanaProvider)\.js$/ }, (a) =>
      a.importer.includes(`${path.sep}miniapp-sdk${path.sep}`) ? { path: a.path, namespace: "stub" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
    // The core package re-exports its zod schemas and Solana helpers from its root. Declared side-effect free,
    // the ones nothing here imports drop out.
    b.onResolve({ filter: /^@farcaster\/miniapp-core$/ }, async (a) => {
      if (a.pluginData?.lean) return;
      const r = await b.resolve(a.path, { resolveDir: a.resolveDir, kind: a.kind, pluginData: { lean: true } });
      return { ...r, sideEffects: false };
    });
  },
};

await esbuild.build({
  stdin: { contents: "export { sdk } from '@farcaster/miniapp-sdk';", resolveDir: process.cwd(), loader: "js" },
  bundle: true, format: "esm", minify: true, target: "es2020", platform: "browser",
  legalComments: "eof", plugins: [lean], outfile: out, logLevel: "warning",
  banner: { js: `/* @farcaster/miniapp-sdk ${version} (MIT) for phuzzles.app/mini, wallets stubbed out. Built by tools/build-miniapp-sdk.mjs; do not edit. */` },
});
console.log(`${out}: ${fs.statSync(out).size} bytes`);
