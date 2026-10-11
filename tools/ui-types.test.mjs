// Type-level tests for UI wave 1 part b, criterion 19: an icon-only control requires an
// accessible name, enforced by the compiler. Repo rules ban ts-comments, so the negative
// fixtures are real compiles that must fail: each fixture is written to a scratch folder
// inside the repo (so module resolution finds node_modules), compiled with the web app's own
// tsconfig, and the diagnostics are read.
// Run: node --test tools/ui-types.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webTsconfig = path.join(root, "apps/web/tsconfig.json");
const tsc = path.join(root, "node_modules/typescript/bin/tsc");
const scratchParent = path.join(root, "node_modules", ".cache");
fs.mkdirSync(scratchParent, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchParent, "nestly-ui-types-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
const compile = (source) => {
  const dir = path.join(scratch, String(counter++));
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "fixture.tsx"), source);
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: webTsconfig,
      compilerOptions: { noEmit: true, incremental: false, tsBuildInfoFile: null },
      include: [path.join(dir, "fixture.tsx")],
    }),
  );
  const result = spawnSync(process.execPath, [tsc, "-p", path.join(dir, "tsconfig.json"), "--pretty", "false"], {
    cwd: root,
    encoding: "utf8",
  });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
};

const header = `import { Button } from "@/components/ui/button";\nimport { MenuIcon } from "@/components/ui/icons";\n`;

describe("criterion 19: icon-only controls require an accessible name (type level)", () => {
  it("[19] control: an icon-only Button WITH a label compiles (the harness is sound)", () => {
    const { ok, output } = compile(
      `${header}export const A = () => <Button iconOnly label="פתיחת התפריט"><MenuIcon /></Button>;\n` +
        `export const B = () => <Button>המשך</Button>;\n`,
    );
    assert.equal(ok, true, output);
  });

  it("[19] an icon-only Button without a label fails tsc", () => {
    const { ok, output } = compile(`${header}export const A = () => <Button iconOnly><MenuIcon /></Button>;\n`);
    assert.equal(ok, false, "omitting the accessible name must not compile");
    assert.match(output, /label/);
  });

  it("[19] an icon-only Button with label undefined fails tsc", () => {
    const { ok } = compile(
      `${header}export const A = (p: { n?: string }) => <Button iconOnly label={p.n}><MenuIcon /></Button>;\n`,
    );
    assert.equal(ok, false, "an optional name must not satisfy the requirement");
  });

  it("[19] an icon-only Button given only aria-hidden children and no label fails tsc", () => {
    const { ok } = compile(
      `${header}export const A = () => <Button iconOnly variant="soft" size="lg"><MenuIcon aria-hidden="true" /></Button>;\n`,
    );
    assert.equal(ok, false);
  });

  it("[19] an icon-only Button with a variant fails tsc (icon-only has one look)", () => {
    const { ok, output } = compile(
      `${header}export const A = () => <Button iconOnly label="x" variant="soft"><MenuIcon /></Button>;
`,
    );
    assert.equal(ok, false, output);
  });
});
