#!/usr/bin/env node
// Verify what `npm pack` would publish: only runtime files, no demo/docs/screenshots/tests/secrets.
// Exit 1 on any forbidden path, missing required file, or a secret-looking string.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
const [info] = JSON.parse(out);
const files = info.files.map((f) => f.path).sort();

const FORBIDDEN = [
  /^docs\//, /^reference\//, /screenshots?\//i, /\.(png|jpe?g|gif|webp|mp4)$/i,
  /(^|\/)tests?\//, /\.test\.|\.spec\./, /^scripts\//, /^js\/views\//, /^js\/core\/synth\.js$/,
  /^themes\//, /\.html$/, /^server\.mjs$/, /(^|\/)\.env/, /\.(pem|key|p12)$/i, /^tsconfig/,
];
const REQUIRED = [
  "package.json", "README.md", "LICENSE", "NOTICE.md", "index.js", "types/index.d.ts",
  "css/hud.css", "css/hud-components.css", "assets/fonts/IBMPlexMono-Light.ttf", "assets/fonts/OFL.txt",
  "js/core/palette.js", "styles/phosphor.js", "styles/paperlab.js", "tokens/base.json",
];
const SECRET = /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|npm_[A-Za-z0-9]{30,})/;

const problems = [];
for (const f of files) if (FORBIDDEN.some((re) => re.test(f))) problems.push(`forbidden: ${f}`);
for (const f of REQUIRED) if (!files.includes(f)) problems.push(`missing: ${f}`);
for (const f of files) {
  if (/\.(ttf|woff2?)$/i.test(f)) continue;
  if (SECRET.test(readFileSync(f, "utf8"))) problems.push(`secret-like string: ${f}`);
}

for (const f of files) console.log(f);
console.log(`\n${files.length} files · packed ${(info.size / 1024).toFixed(1)} kB · unpacked ${(info.unpackedSize / 1024).toFixed(1)} kB`);
if (problems.length) { console.error("\n" + problems.join("\n")); process.exit(1); }
console.log("pack check: ok");
