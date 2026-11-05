// Writes <outDir>/THIRD-PARTY-LICENSES.txt: the licences of the npm packages
// the panel is built from and of the fonts it ships, which ask to travel with
// the code. Run after a build:  node scripts/licenses.mjs dist
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, process.argv[2] ?? "dist");
if (!existsSync(outDir)) {
  console.error(`[licenses] ${outDir} doesn't exist: build first`);
  process.exit(1);
}

// Production dependencies only: dev tools don't end up in the bundle.
const byLicense = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const NOTICE = /^(licen[cs]e|copying|notice)(\.|-|$)/i;
const packages = Object.values(byLicense)
  .flat()
  .map((p) => {
    const dir = p.paths?.[0];
    const files =
      dir && existsSync(dir)
        ? readdirSync(dir)
            .filter((f) => NOTICE.test(f))
            .sort()
        : [];
    const text = files.map((f) => readFileSync(join(dir, f), "utf8").trim()).join("\n\n");
    return {
      name: p.name,
      version: p.versions.join(", "),
      license: p.license,
      homepage: p.homepage,
      text,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const fontsDir = join(root, "src", "fonts");
const fonts = readdirSync(fontsDir)
  .filter((f) => f.startsWith("OFL-"))
  .sort()
  .map((f) => ({
    name: f.replace(/^OFL-|\.txt$/g, "").replace(/-/g, " "),
    text: readFileSync(join(fontsDir, f), "utf8").trim(),
  }));

const rule = "-".repeat(80);
const parts = [
  "ferrite-web: third-party software",
  "=================================",
  "",
  "The ferrite panel itself is licensed under the MIT licence. It is built from",
  "the open-source packages and fonts below, each under its own licence,",
  "reproduced here as those licences require.",
  "",
];
for (const p of packages) {
  parts.push(rule, `${p.name} ${p.version}`, `Licence: ${p.license}`);
  if (p.homepage) parts.push(p.homepage);
  parts.push(
    "",
    p.text || `(The package carries no licence file; its licence is ${p.license}.)`,
    "",
  );
}
for (const f of fonts) {
  parts.push(rule, `Font: ${f.name}`, "Licence: SIL Open Font License 1.1", "", f.text, "");
}

writeFileSync(join(outDir, "THIRD-PARTY-LICENSES.txt"), parts.join("\n"));
console.log(
  `[licenses] ${packages.length} packages and ${fonts.length} fonts -> ${outDir}/THIRD-PARTY-LICENSES.txt`,
);
