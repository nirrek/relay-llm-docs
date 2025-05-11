#!/usr/bin/env node --no-warnings=ExperimentalWarning

import { exec as execCb } from "child_process";
import { promisify } from "util";
import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import type { Dirent } from "fs";
import { join, basename, extname } from "path";

const exec = promisify(execCb);

// === CONFIGURATION ===
const REPO_URL = "https://github.com/facebook/relay.git";
const TMP_DIR = "./tmp-relay";
const OUT_DIR = "./docs";
// =====================

async function main(): Promise<void> {
  const branchOrTag = getBranchOrTagArg();

  // 1) clone
  await rm(TMP_DIR, { recursive: true, force: true });
  console.log(`Cloning ${REPO_URL}@${branchOrTag} into ${TMP_DIR}…`);
  await exec(
    `git clone --branch ${branchOrTag} --depth 1 ${REPO_URL} ${TMP_DIR}`,
  );

  // 2) scan versioned_docs
  const versionRoot = join(TMP_DIR, "website", "versioned_docs");
  const entries: Dirent[] = await readdir(versionRoot, { withFileTypes: true });

  const versionDirs = entries
    .filter((d) => d.isDirectory() && d.name.match(/^version-v\d+\.\d+\.\d+$/))
    .map((d) => join(versionRoot, d.name));

  // 3) ensure output folder
  await mkdir(OUT_DIR, { recursive: true });

  // 4) build each .txt with XML wrapper
  for (const dirPath of versionDirs) {
    const versionFolder = basename(dirPath); // e.g. "version-v13.0.0"
    const version = versionFolder.replace(/^version-v/, ""); // "13.0.0"
    const outFile = join(OUT_DIR, `${versionFolder}.txt`);

    const mdFiles = await collectMdFiles(dirPath);
    mdFiles.sort();
    const chunks = await Promise.all(mdFiles.map((f) => readFile(f, "utf8")));

    const xmlWrapped = [
      `<relay-docs relay-version="${version}">`,
      ...chunks,
      `</relay-docs>`,
    ].join("\n\n");

    await writeFile(outFile, xmlWrapped, "utf8");
    console.log(`→ Built ${outFile}`);
  }

  // 5) generate index.html linking all .txt (newest-to-oldest)
  const outEntries = await readdir(OUT_DIR, { withFileTypes: true });
  const txtFiles = outEntries
    .filter((e) => e.isFile() && e.name.endsWith(".txt"))
    .map((e) => e.name);

  // parse semver and sort descending
  const sortedFiles = txtFiles
    .map((filename) => {
      const sem = filename.replace(/^version-v/, "").replace(/\.txt$/, "");
      const parts = sem.split(".").map((n) => parseInt(n, 10));
      return { filename, parts };
    })
    .sort((a, b) => {
      for (let i = 0; i < 3; i++) {
        if (b.parts[i] !== a.parts[i]) {
          return b.parts[i]! - a.parts[i]!;
        }
      }
      return 0;
    })
    .map((o) => o.filename);

  const links = sortedFiles
    .map((f) => `      <li><a href="./${f}">${f}</a></li>`)
    .join("\n");

  const indexHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Relay LLM Docs</title>
  </head>
  <body>
    <h1>Relay LLM Docs</h1>
    <ul>
${links}
    </ul>
  </body>
</html>`;

  await writeFile(join(OUT_DIR, "index.html"), indexHtml, "utf8");
  console.log("→ Built ${OUT_DIR}/index.html");

  // 6) clean up the temp folder
  await rm(TMP_DIR, { recursive: true, force: true });

  console.log("✅ All done.");
}

/** If you pass one arg, that’s the branch/tag; else defaults to "main" */
function getBranchOrTagArg(): string {
  const args = process.argv.slice(2);
  if (args.length === 0) return "main";
  if (args.length === 1) return args[0]!;
  console.error("Usage: ./build.mts [<branch-or-tag>]");
  process.exit(1);
}

/** Recursively find all `.md` under a dir */
async function collectMdFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const ents: Dirent[] = await readdir(dir, { withFileTypes: true });

  for (const ent of ents) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectMdFiles(full)));
    } else if (ent.isFile() && extname(ent.name) === ".md") {
      out.push(full);
    }
  }

  return out;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
